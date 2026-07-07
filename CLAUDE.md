# Website Design Recreation — HTML or React

## Workflow

When the user provides a reference image, screenshot, and optionally CSS classes or style notes:

1. **Generate the implementation** in one of these formats:
   - **HTML mode:** single `index.html` file using Tailwind CSS via CDN.
   - **React mode:** React component/page using Tailwind CSS classes.
     - For Vite/React: create or update `src/App.jsx`.
     - For Next.js App Router: create or update `app/page.jsx`.
     - For Next.js Pages Router: create or update `pages/index.jsx`.

2. **Keep all visible content inline** unless the user provides assets or asks for separate files.

3. **Use Tailwind CSS** for styling.
   - In HTML mode, use:

     ```html
     <script src="https://cdn.tailwindcss.com"></script>
     ```

   - In React mode, assume Tailwind is already configured unless the user asks for setup help.

4. **Screenshot the rendered page** using Puppeteer, Playwright, or an equivalent browser screenshot tool.
   - HTML mode: render `index.html`.
   - React mode: run the dev server, then screenshot the local page.
   - Capture full-page screenshots.
   - If the page has distinct sections, capture those individually too.

5. **Compare** the screenshot against the reference image. Check for mismatches in:
   - Spacing and padding, measured in px
   - Font sizes, weights, and line heights
   - Colors and exact hex values
   - Alignment and positioning
   - Border radii, shadows, and effects
   - Responsive behavior
   - Image/icon sizing and placement

6. **Fix every visible mismatch.**
   - Edit the HTML or React/Tailwind code.
   - Do not change the design creatively.
   - Match the reference image exactly.

7. **Re-screenshot and compare again.**

8. **Repeat** steps 5–7 until the result is within ~2–3px of the reference everywhere.

Do **not** stop after one pass. Always do at least 2 comparison rounds. Only stop when the user says so or when no visible differences remain.

## Technical Defaults

- Use Tailwind CSS.
- Use placeholder images from `https://placehold.co/` when source images are not provided.
- Use mobile-first responsive design.
- Use semantic JSX in React mode.
- Keep components simple unless the design clearly repeats sections.
- Avoid over-abstracting; inline Tailwind classes are acceptable.

## React Rules

- Use `className`, not `class`.
- Use `htmlFor`, not `for`.
- Self-close JSX tags such as `<img />`, `<input />`, and `<br />`.
- Store repeated data in arrays only when it improves readability.
- Do not add interactivity unless it exists in the reference image.
- Do not introduce extra sections, animations, routes, state, or libraries unless requested.
- Use local placeholder constants for image URLs if needed.
- Keep the output easy to paste into an existing React project.

## Rules

- Do not add features, sections, or content not present in the reference image.
- Match the reference exactly — do not “improve” the design.
- If the user provides CSS classes or style tokens, use them verbatim.
- Be specific during comparisons, for example:
  - “Heading is ~32px but reference shows ~24px.”
  - “Card gap is 16px but should be 24px.”
  - “Button radius is too sharp; reference uses ~12px.”
