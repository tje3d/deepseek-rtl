# deepseek-rtl

A userscript that fixes RTL text alignment, emoji positioning, and font consistency for Persian, Arabic, Urdu, Pashto, Kurdish, and Hebrew on [DeepSeek](https://chat.deepseek.com/), while keeping code blocks LTR-safe.

## Version

`1.0.0`

## Installation

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Install the script from the raw source:
   [deepseek-rtl.user.js](https://raw.githubusercontent.com/tje3d/deepseek-rtl/main/deepseek-rtl.user.js)
3. Open [https://chat.deepseek.com/](https://chat.deepseek.com/) — the script runs automatically.

A toggle button (`RTL ON` / `RTL OFF`) appears in the bottom-right corner. Your preference is saved in `localStorage`.

## Features

- RTL direction and right alignment for Persian / Arabic / Urdu / Pashto / Kurdish / Hebrew text.
- LTR-safe code blocks, inline code, and syntax highlighting.
- Correct positioning of numbers and emoji/symbols within RTL text.
- Unified font stack for mixed Persian and English content.
- Textarea RTL support for the DeepSeek prompt box.

## Credits

Author: Moein Porkamel. Licensed under MIT.
