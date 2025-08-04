import requests

res = requests.post("http://localhost:11434/api/generate", json={
    "model": "llama3.1",
    "prompt": "Give me 3 healthy breakfast ideas.",
    "stream": False
})
print(res.json()['response'])
