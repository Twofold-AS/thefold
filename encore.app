{
	"id":   "thefold-aoti",
	"lang": "typescript",
	"ignore": ["frontend", ".claude"],
	"global_cors": {
		"allow_origins_with_credentials": [
			"http://localhost:3000",
			"http://localhost:4000",
			"http://127.0.0.1:3000",
			"http://127.0.0.1:4000",
			"https://thefold.twofold.no"
		],
		"allow_headers": ["Authorization", "Content-Type", "X-CSRF-Token", "X-Request-Id"],
		"expose_headers": ["X-Request-Id", "Retry-After", "X-RateLimit-Remaining", "X-RateLimit-Reset"]
	}
}
