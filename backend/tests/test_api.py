"""Document API (DB-backed) — FR-A1/A2/A3/A5."""


def _upload(client, sample_pdf, category="Safety", name="g.pdf"):
    with open(sample_pdf, "rb") as f:
        return client.post(
            "/documents",
            files={"file": (name, f, "application/pdf")},
            data={"category": category},
        )


def test_upload_then_list(client, sample_pdf):
    r = _upload(client, sample_pdf)
    assert r.status_code == 201
    body = r.json()
    assert body["document"]["status"] == "ready"
    assert body["document"]["category"] == "Safety"

    listed = client.get("/documents").json()
    assert len(listed) == 1
    assert listed[0]["filename"] == "g.pdf"


def test_replace_via_put(client, sample_pdf):
    doc_id = _upload(client, sample_pdf, name="v1.pdf").json()["document"]["id"]
    with open(sample_pdf, "rb") as f:
        r = client.put(
            f"/documents/{doc_id}",
            files={"file": ("v2.pdf", f, "application/pdf")},
            data={"category": "Quality"},
        )
    assert r.status_code == 200
    new = r.json()["document"]
    assert new["version"] == 2
    assert new["category"] == "Quality"
    assert client.get("/documents").json().__len__() == 1


def test_delete(client, sample_pdf):
    doc_id = _upload(client, sample_pdf).json()["document"]["id"]
    assert client.delete(f"/documents/{doc_id}").status_code == 204
    assert client.get("/documents").json() == []


def test_delete_missing_404(client):
    import uuid

    assert client.delete(f"/documents/{uuid.uuid4()}").status_code == 404


def test_non_pdf_rejected(client):
    r = client.post(
        "/documents",
        files={"file": ("note.txt", b"hello", "text/plain")},
        data={"category": "Safety"},
    )
    assert r.status_code == 400
