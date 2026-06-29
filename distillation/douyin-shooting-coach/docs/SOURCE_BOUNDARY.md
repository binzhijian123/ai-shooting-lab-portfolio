# Source Boundary

## Current Source

Creator homepage:
https://www.douyin.com/user/MS4wLjABAAAAt5TumWfhHwGqpg6Cg73S_wnlmFtgK3k40iz5G2SucQ0?from_tab_name=main

## Verified Platform Signals

- Douyin `robots.txt` lists restrictions for multiple crawler/search agents and disallows several URL patterns.
- Douyin privacy policy says account public information and published works can be displayed on public profile pages, and browsing/search behavior can involve data processing.

## Execution Boundary

Allowed:

- Process public video URLs supplied by the user.
- Process subtitles, transcripts, or notes legally provided by the user.
- Record missing transcripts in `outputs/needs_transcript.json`.
- Distill transferable shooting rules, diagnostics, and drills.

Not allowed:

- Bypass login, CAPTCHA, risk-control, member-only access, paywalls, or privacy settings.
- Use cookies, account credentials, packet-captured APIs, signature reverse engineering, proxy pools, or high-concurrency scraping.
- Download, rehost, or republish raw video, cover images, comments, or personal interaction data.
- Claim complete creator coverage unless the source inventory is deterministic and user-verified.

## Required User Input If Blocked

Preferred input formats:

- `inputs/video_urls.txt`: one public video URL per line.
- `inputs/source_inventory.csv`: URL, title, publish time, priority, transcript path.
- `outputs/transcripts/*.txt|*.md|*.srt|*.vtt`: legal transcript or notes files.

Until those inputs exist, this project should say `needs_video_list` or `needs_transcript`, not `processed`.

