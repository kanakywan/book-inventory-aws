import re
import unicodedata


def normalize_text(value: str) -> str:
    if not value:
        return ""

    value = value.lower().strip()
    value = unicodedata.normalize("NFKD", value)
    value = "".join([c for c in value if not unicodedata.combining(c)])
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    value = re.sub(r"\s+", " ", value)

    return value.strip()


def suggest_book_from_text(lines):
    clean_lines = [line.strip() for line in lines if line and len(line.strip()) > 1]

    title = ""
    publisher = ""
    edition = ""
    category = "Não categorizado"

    ignored_words = ["editora", "edição", "edicao", "isbn"]

    candidate_lines = []
    for line in clean_lines:
        lower = normalize_text(line)

        if "l pm" in lower or "lpm" in lower:
            publisher = "L&PM"

        if "edicao" in lower or "edição" in line.lower():
            edition = line

        if not any(word in lower for word in ignored_words):
            candidate_lines.append(line)

    if candidate_lines:
        title = " ".join(candidate_lines[:2]).title()

    if any(word in normalize_text(" ".join(clean_lines)) for word in ["discurso", "politica", "mundo moderno"]):
        category = "História / Política / Discursos"

    return {
        "title": title,
        "publisher": publisher,
        "edition": edition,
        "category": category,
    }
