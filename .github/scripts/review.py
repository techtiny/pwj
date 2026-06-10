import os
import subprocess
import json
import urllib.request

def call_claude(api_key, diff):
    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1500,
        "messages": [{
            "role": "user",
            "content": (
                "You are a senior React/JavaScript engineer reviewing a git diff.\n"
                "Focus on:\n"
                "- Bugs and logic errors\n"
                "- Security vulnerabilities (XSS, exposed secrets, unsafe innerHTML)\n"
                "- React best practices (hooks rules, missing deps, stale closures)\n"
                "- Performance issues (missing memo/callback, unnecessary re-renders)\n"
                "- Accessibility issues\n\n"
                "Format your response with:\n"
                "🔴 **Critical** — must fix before merge\n"
                "🟡 **Warning** — should fix soon\n"
                "🟢 **Suggestion** — nice to have\n"
                "✅ **Looks good** — if no issues found\n\n"
                "Be concise. Reference specific file/line where possible.\n\n"
                f"```diff\n{diff}\n```"
            )
        }]
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())["content"][0]["text"]


def post_comment(token, repo, sha, body):
    payload = json.dumps({"body": body}).encode()
    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/commits/{sha}/comments",
        data=payload,
        headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
        }
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        print(f"Comment posted: HTTP {resp.status}")


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    token   = os.environ.get("GITHUB_TOKEN", "")
    sha     = os.environ.get("GITHUB_SHA", "")
    repo    = os.environ.get("GITHUB_REPOSITORY", "")

    if not api_key:
        print("ANTHROPIC_API_KEY not set — skipping review")
        return

    result = subprocess.run(
        ["git", "diff", "HEAD~1", "HEAD", "--",
         "*.jsx", "*.js", "*.ts", "*.tsx", "*.css",
         ":!node_modules/*", ":!dist/*", ":!*.min.js"],
        capture_output=True, text=True
    )
    diff = result.stdout.strip()

    if len(diff) < 80:
        print("Diff too small — nothing to review")
        return

    MAX = 55000
    truncated = ""
    if len(diff) > MAX:
        diff = diff[:MAX]
        truncated = "\n\n> ⚠️ Diff was truncated to 55 KB."

    print(f"Diff size: {len(diff)} chars — sending to Claude...")
    review = call_claude(api_key, diff)

    body = (
        "## 🤖 AI Code Review\n\n"
        + review
        + truncated
        + "\n\n---\n*Reviewed by [Claude Haiku 4.5](https://claude.ai/claude-code)*"
    )
    post_comment(token, repo, sha, body)


if __name__ == "__main__":
    main()
