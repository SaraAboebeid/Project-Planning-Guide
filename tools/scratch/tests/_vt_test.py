import urllib.request, base64, json

ID  = "D016LXgep9AJv4z3k0EPmiOXfYka"
SEC = "kaEb3XDR0jqZEG80WJndC7DEyXMa"

# Get token
b64 = base64.b64encode(f"{ID}:{SEC}".encode()).decode()
req = urllib.request.Request(
    "https://ext-api.vasttrafik.se/token",
    data=b"grant_type=client_credentials", method="POST"
)
req.add_header("Content-Type", "application/x-www-form-urlencoded")
req.add_header("Authorization", f"Basic {b64}")
token = json.loads(urllib.request.urlopen(req, timeout=10).read())["access_token"]
print("Token OK")

# Test endpoints
urls = [
    "https://ext-api.vasttrafik.se/pr/v4/stop-areas?limit=3",
    "https://ext-api.vasttrafik.se/geo/v3/StopAreas?offset=0&limit=3",
    "https://ext-api.vasttrafik.se/pr/v4/positions?lowerLeftLat=57.65&lowerLeftLong=11.90&upperRightLat=57.75&upperRightLong=12.05",
    "https://ext-api.vasttrafik.se/ts/v1/traffic-situations",
    "https://ext-api.vasttrafik.se/spp/v3/parkings",
]
for url in urls:
    r2 = urllib.request.Request(url)
    r2.add_header("Authorization", f"Bearer {token}")
    try:
        resp = urllib.request.urlopen(r2, timeout=10)
        body = resp.read()
        parsed = json.loads(body)
        count = len(parsed) if isinstance(parsed, list) else len(parsed.get('results', parsed.get('stopAreas', parsed.get('trafficSituations', []))))
        print(f"OK  ({count} items)  {url[40:80]}")
    except urllib.error.HTTPError as e:
        print(f"{e.code} {url[40:80]}: {e.read().decode()[:100]}")
