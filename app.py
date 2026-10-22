import hmac
import logging
import os
import re
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge


DATABASE_URL = os.environ.get("DATABASE_URL")
APP_PASSWORD = os.environ.get("APP_PASSWORD")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")
if not APP_PASSWORD or len(APP_PASSWORD) < 12:
    raise RuntimeError("APP_PASSWORD must be set to at least 12 characters")

ROOT = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=str(ROOT / "public"), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 3600
logger = logging.getLogger(__name__)
pool = ConnectionPool(
    conninfo=DATABASE_URL,
    kwargs={"sslmode": "require"},
    min_size=1,
    max_size=5,
    open=False,
)

pool.open(wait=True)
with pool.connection() as connection:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS app_documents (
            path text PRIMARY KEY,
            data jsonb NOT NULL,
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )


def valid_document(collection, doc_id):
    if collection == "app":
        return doc_id == "settings"
    if collection == "classes":
        return re.fullmatch(r"[A-Za-z0-9]+", doc_id) is not None
    if collection == "att":
        return re.fullmatch(r"[A-Za-z0-9]+_\d{4}-\d{2}", doc_id) is not None
    return False


@app.before_request
def require_password():
    authorization = request.authorization
    password = (
        authorization.password
        if authorization and authorization.password is not None
        else ""
    )
    valid = (
        authorization is not None
        and authorization.type.lower() == "basic"
        and authorization.username == "teacher"
        and hmac.compare_digest(
            password.encode("utf-8"), APP_PASSWORD.encode("utf-8")
        )
    )
    if valid:
        return None
    return (
        "يلزم تسجيل الدخول للوصول إلى سجل الفصل.",
        401,
        {"WWW-Authenticate": 'Basic realm="Sijil Alfasl", charset="UTF-8"'},
    )


@app.after_request
def set_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    if request.path == "/sw.js":
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/health")
def health():
    return jsonify(ok=True)


@app.get("/api/collections/<collection>")
def get_collection(collection):
    if collection not in {"classes", "att"}:
        return jsonify(error="Unknown collection"), 404

    with pool.connection() as connection:
        rows = connection.execute(
            "SELECT path, data FROM app_documents WHERE path LIKE %s ORDER BY path",
            (f"{collection}/%",),
        ).fetchall()
    docs = [
        {"id": row[0][len(collection) + 1 :], "data": row[1]}
        for row in rows
    ]
    return jsonify(docs=docs, empty=not docs)


@app.get("/api/docs/<collection>/<doc_id>")
def get_document(collection, doc_id):
    if not valid_document(collection, doc_id):
        return jsonify(error="Unknown document"), 404

    with pool.connection() as connection:
        row = connection.execute(
            "SELECT data FROM app_documents WHERE path = %s",
            (f"{collection}/{doc_id}",),
        ).fetchone()
    if row is None:
        return jsonify(exists=False, data=None)
    return jsonify(exists=True, data=row[0])


@app.put("/api/docs/<collection>/<doc_id>")
def put_document(collection, doc_id):
    if not valid_document(collection, doc_id):
        return jsonify(error="Unknown document"), 404

    body = request.get_json(silent=True)
    if not isinstance(body, dict) or not isinstance(body.get("data"), dict):
        return jsonify(error="Document data must be an object"), 400

    with pool.connection() as connection:
        connection.execute(
            """
            INSERT INTO app_documents (path, data, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (path) DO UPDATE
            SET data = EXCLUDED.data, updated_at = now()
            """,
            (f"{collection}/{doc_id}", Jsonb(body["data"])),
        )
    return "", 204


@app.delete("/api/docs/<collection>/<doc_id>")
def delete_document(collection, doc_id):
    if not valid_document(collection, doc_id):
        return jsonify(error="Unknown document"), 404

    with pool.connection() as connection:
        connection.execute(
            "DELETE FROM app_documents WHERE path = %s",
            (f"{collection}/{doc_id}",),
        )
    return "", 204


@app.errorhandler(RequestEntityTooLarge)
def request_too_large(error):
    return jsonify(error="Request body exceeds 10 MB"), 413


@app.errorhandler(Exception)
def handle_error(error):
    if isinstance(error, HTTPException):
        return error
    logger.exception("Request failed", exc_info=error)
    return jsonify(error="حدث خطأ في الخادم. حاول مرة أخرى."), 500
