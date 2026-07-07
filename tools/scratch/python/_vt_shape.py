import urllib.request, base64, json

ID  = "D016LXgep9AJv4z3k0EPmiOXfYka"
SEC = "kaEb3XDR0jqZEG80WJndC7DEyXMa"

b64 = base64.b64encode(f"{ID}:{SEC}".encode()).decode()
req = urllib.request.Request(
    "https://ext-api.vasttrafik.se/token",
    data=b"grant_type=client_credentials", method="POST"
)
req.add_header("Content-Type", "application/x-www-form-urlencoded")
req.add_header("Authorization", f"Basic {b64}")
token = json.loads(urllib.request.urlopen(req, timeout=10).read())["access_token"]

def get(url):
    r = urllib.request.Request(url)
    r.add_header("Authorization", f"Bearer {token}")
    return json.loads(urllib.request.urlopen(r, timeout=10).read())

# Disruption sample
d = get("https://ext-api.vasttrafik.se/ts/v1/traffic-situations")
print("=== DISRUPTION SAMPLE ===")
print(json.dumps(d[0] if isinstance(d, list) else d, indent=2)[:1200])

# Parking sample
p = get("https://ext-api.vasttrafik.se/spp/v3/parkings")
print("\n=== PARKING SAMPLE ===")
sample = p[0] if isinstance(p, list) else p
print(json.dumps(sample, indent=2)[:1200])

# Parking availability for first id
pid = sample.get("id") or sample.get("parkingId") or sample.get("areaId", "")
if pid:
    try:
        av = get(f"https://ext-api.vasttrafik.se/spp/v3/availableCapacity/{pid}")
        print(f"\n=== AVAILABILITY for {pid} ===")
        print(json.dumps(av, indent=2)[:600])
    except Exception as e:
        print(f"availability error: {e}")
