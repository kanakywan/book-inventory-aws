import json
import os
import uuid
from datetime import datetime, timezone
from urllib.parse import parse_qs

import boto3

from book_parser import normalize_text, suggest_book_from_text


dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")
rekognition = boto3.client("rekognition")

BOOKS_TABLE = os.environ["BOOKS_TABLE"]
COVERS_BUCKET = os.environ["COVERS_BUCKET"]

table = dynamodb.Table(BOOKS_TABLE)


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Authorization,Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }


def get_user_id(event):
    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )

    user_id = claims.get("sub")

    if not user_id:
        raise ValueError("Usuário não autenticado")

    return user_id


def lambda_handler(event, context):
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method")
        path = event.get("requestContext", {}).get("http", {}).get("path", "")

        if method == "OPTIONS":
            return response(200, {"ok": True})

        if path == "/books/upload-url" and method == "POST":
            return create_upload_url(event)

        if path == "/books/scan" and method == "POST":
            return scan_book_cover(event)

        if path == "/books" and method == "POST":
            return create_book(event)

        if path == "/books" and method == "GET":
            return list_books(event)

        if path == "/books/search" and method == "GET":
            return search_books(event)

        if path.startswith("/books/") and method == "DELETE":
            return delete_book(event)

        return response(404, {"message": "Rota não encontrada"})

    except Exception as error:
        return response(500, {"message": str(error)})


def create_upload_url(event):
    user_id = get_user_id(event)

    body = json.loads(event.get("body") or "{}")
    content_type = body.get("contentType", "image/jpeg")

    if content_type not in ["image/jpeg", "image/png"]:
        return response(400, {"message": "Formato permitido: JPEG ou PNG"})

    book_id = str(uuid.uuid4())
    extension = "png" if content_type == "image/png" else "jpg"
    image_key = f"covers/{user_id}/{book_id}.{extension}"

    upload_url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": COVERS_BUCKET,
            "Key": image_key,
            "ContentType": content_type,
        },
        ExpiresIn=300,
    )

    return response(
        200,
        {
            "bookId": book_id,
            "imageKey": image_key,
            "uploadUrl": upload_url,
        },
    )


def scan_book_cover(event):
    user_id = get_user_id(event)

    body = json.loads(event.get("body") or "{}")
    image_key = body.get("imageKey")

    if not image_key:
        return response(400, {"message": "imageKey é obrigatório"})

    if not image_key.startswith(f"covers/{user_id}/"):
        return response(403, {"message": "Imagem não pertence ao usuário"})

    result = rekognition.detect_text(
        Image={
            "S3Object": {
                "Bucket": COVERS_BUCKET,
                "Name": image_key,
            }
        }
    )

    detected_lines = []
    for item in result.get("TextDetections", []):
        if item.get("Type") == "LINE" and item.get("Confidence", 0) >= 60:
            detected_lines.append(item.get("DetectedText", ""))

    suggestion = suggest_book_from_text(detected_lines)

    return response(
        200,
        {
            "detectedText": detected_lines,
            "suggestion": suggestion,
        },
    )


def create_book(event):
    user_id = get_user_id(event)
    body = json.loads(event.get("body") or "{}")

    book_id = body.get("bookId") or str(uuid.uuid4())
    title = body.get("title", "").strip()

    if not title:
        return response(400, {"message": "Título é obrigatório"})

    now = datetime.now(timezone.utc).isoformat()

    item = {
        "PK": f"USER#{user_id}",
        "SK": f"BOOK#{book_id}",
        "bookId": book_id,
        "userId": user_id,
        "title": title,
        "normalizedTitle": normalize_text(title),
        "authors": body.get("authors", ""),
        "publisher": body.get("publisher", ""),
        "edition": body.get("edition", ""),
        "category": body.get("category", "Não categorizado"),
        "status": body.get("status", "Tenho"),
        "coverImageKey": body.get("coverImageKey", ""),
        "createdAt": now,
        "updatedAt": now,
    }

    table.put_item(Item=item)

    return response(201, {"message": "Livro cadastrado com sucesso", "book": item})


def list_books(event):
    user_id = get_user_id(event)

    result = table.query(
        KeyConditionExpression="PK = :pk",
        ExpressionAttributeValues={":pk": f"USER#{user_id}"},
    )

    books = sorted(
        result.get("Items", []),
        key=lambda item: item.get("title", "").lower(),
    )

    return response(200, {"books": books})


def search_books(event):
    user_id = get_user_id(event)

    raw_query = event.get("rawQueryString") or ""
    params = parse_qs(raw_query)
    q = params.get("q", [""])[0]

    normalized_query = normalize_text(q)

    result = table.query(
        KeyConditionExpression="PK = :pk",
        ExpressionAttributeValues={":pk": f"USER#{user_id}"},
    )

    books = result.get("Items", [])

    matches = []
    for book in books:
        normalized_title = book.get("normalizedTitle", "")
        if normalized_query in normalized_title:
            matches.append(book)

    return response(200, {"query": q, "matches": matches})


def delete_book(event):
    user_id = get_user_id(event)
    path_params = event.get("pathParameters") or {}
    book_id = path_params.get("bookId")

    if not book_id:
        return response(400, {"message": "bookId é obrigatório"})

    table.delete_item(
        Key={
            "PK": f"USER#{user_id}",
            "SK": f"BOOK#{book_id}",
        }
    )

    return response(200, {"message": "Livro removido com sucesso"})
