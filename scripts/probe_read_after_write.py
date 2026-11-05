import http.client, json
c = http.client.HTTPConnection("127.0.0.1", 8000)
def call(method, path, body=None, csrf="", cookie=""):
    h = {"Content-Type": "application/json", "X-CSRF-Token": csrf, "Cookie": cookie}
    c.request(method, "/api/v1" + path, body=json.dumps(body) if body is not None else None, headers=h)
    r = c.getresponse(); data = r.read()
    return r.status, (json.loads(data) if data else None), r.getheader("set-cookie")
s, d, sc = call("POST", "/auth/login", {"email": "analyst@aegis.local", "password": "aegis-demo-2026!"})
cookie = sc.split(";")[0]; csrf = d["csrf_token"]
s, targets, _ = call("GET", "/targets", cookie=cookie)
tid = next(t["id"] for t in targets if t["slug"] == "demo-web")
miss = 0; N = 300
for _ in range(N):
    s, r, _ = call("POST", "/purple/cases", {"target_id": tid}, csrf, cookie)
    s2, _, _ = call("GET", f"/purple/cases/{r['case']['id']}", cookie=cookie)
    miss += s2 == 404
print(f"read-after-write 404s on one keep-alive connection: {miss}/{N}")
