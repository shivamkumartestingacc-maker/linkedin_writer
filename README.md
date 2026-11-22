# LinkedIn Writer

Write LinkedIn posts with bold, italic and other styles, and see how they look in the feed before you post.

## Use

Open `index.html` in a browser. No install, no build.

- **Left:** editor. Select text, then use the toolbar or Ctrl+B / Ctrl+I / Ctrl+U.
- **Emojis:** click a favourite to insert it. **Edit** lets you remove favourites, add any emoji from **More**, or add your own symbol.
- **Right:** LinkedIn preview. **Feed** shows the 3-line cut with "…more". **Expanded** shows the full post. Add an image to preview it.
- **Copy for LinkedIn:** copies the post. Paste it into LinkedIn and the styling stays.

## How styling survives paste

LinkedIn has no rich text. Bold, italic and monospace use Unicode look-alike letters (for example `𝗛𝗲𝗹𝗹𝗼`). Underline and strikethrough use combining marks. These are plain characters, so any paste keeps them.

Limits:
- Screen readers and LinkedIn search may not read styled letters as normal words. Style only short phrases.
- Each styled letter counts as 2 characters toward LinkedIn's 3000 limit.
- Italic has no digits in Unicode, so italic numbers stay plain.

Drafts, favourites, name and headline save in your browser (localStorage). Images stay on your computer.

## Test

```bash
node test.js
```
