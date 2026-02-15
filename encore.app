{
	"id":   "thefold-aoti",
	"lang": "typescript",
	"ignore": ["frontend"],
	"global_cors": {
		"allow_origins_with_credentials": [
			"http://localhost:3000",
			"http://localhost:4000",
			"https://thefold.twofold.no"
		],
		"allow_headers": ["Authorization", "Content-Type"],
		"expose_headers": ["X-Request-Id"]
	}
}
