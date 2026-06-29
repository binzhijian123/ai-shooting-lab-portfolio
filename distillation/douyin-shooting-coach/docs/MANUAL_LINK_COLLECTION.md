# Manual Link Collection

This is the preferred low-risk way to collect public Douyin video URLs for the
shooting-coach distillation project.

## Steps

1. Open https://www.douyin.com/ in a normal browser.
2. Open the creator homepage:
   https://www.douyin.com/user/MS4wLjABAAAAt5TumWfhHwGqpg6Cg73S_wnlmFtgK3k40iz5G2SucQ0?from_tab_name=main
3. Scroll down until all target public works are loaded in the page.
4. Open browser Developer Tools and switch to Console.
5. Run:

```js
[...new Set(
  [...document.querySelectorAll('a[href*="/video/"]')]
    .map(a => new URL(a.getAttribute('href'), location.href).href)
)].join('\n')
```

6. Copy the output into `inputs/video_urls.txt`, one URL per line.

## Important Limits

- This only collects video links that are already loaded in your visible browser page.
- It does not bypass login, CAPTCHA, platform risk control, member-only access, or private content.
- If the page stops loading more works, do not use cookies, private APIs, signature reverse engineering, proxy pools, or packet-captured endpoints.
- The output should be described as "loaded public links from the user-visible page", not guaranteed full creator coverage unless you manually verified every work was loaded.

## After Collection

Run a small pilot first:

- 1 to 3 videos for rule-card quality.
- Then batches of 5 to 10 videos.
- Record missing transcript or unavailable items in `outputs/needs_transcript.json`.

