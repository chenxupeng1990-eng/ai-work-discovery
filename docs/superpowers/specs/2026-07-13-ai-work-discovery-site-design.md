# AI Work Discovery Site Design

Date: 2026-07-13
Status: Approved design

## 1. Product Definition

The product is a public, company-facing AI work discovery site. It is not a formal course platform and not an AI news portal. Its primary purpose is to help colleagues discover practical ideas, collaboration patterns, tools, cases, and forward-looking industry signals that can be applied at work.

The site combines:

- AI work inspiration and creative ideas
- Team collaboration methods
- Desensitized company cases
- Public Feishu documents
- Codex, Skills, MCP, prompts, commands, and configuration resources
- Curated AI industry signals, including selected AI HOT links
- A small, secondary collection of foundational Codex guidance

Only public material and explicitly desensitized company cases may be published.

## 2. Product Principles

1. Discovery before curriculum: users should be able to browse and find useful ideas without following a rigid learning path.
2. Practical before comprehensive: content should explain why it is useful and how it can be applied at work.
3. Low-friction reuse: commands, prompts, paths, configuration, and code should be copyable in one action.
4. Low-cost maintenance: Feishu Base is the CMS and the website is statically generated.
5. Human-reviewed publishing: AI may prepare drafts but may not publish public content automatically.
6. Public by design: credentials, internal fields, private links, and unreviewed content must never reach the browser bundle.

## 3. Audience

Primary users are company colleagues with mixed technical backgrounds:

- Business, operations, marketing, content, and creative roles looking for AI work ideas
- Colleagues beginning to use Codex or other AI tools
- Technical users looking for reusable Skills, MCPs, commands, and workflows
- Team leads looking for collaboration patterns and industry direction

The public site does not require company login. It must remain understandable to an external visitor and may only display approved public or desensitized material.

## 4. Information Architecture

### 4.1 Primary Navigation

- Discover
- Practice Cases
- Collaboration
- Tools and Resources
- AI Signals
- Recent Updates

Foundational Codex content is not a primary learning path. It appears as a secondary "Ready to Use" or "Getting Started" area.

### 4.2 Homepage

The homepage uses a discovery-first structure inspired by the browsing efficiency of the WayToAGI events page.

1. Header navigation with search and content submission entry
2. Featured editorial spotlight for one important case, workflow, or industry signal
3. Lightweight category filters
4. Featured/latest segmented sorting
5. "Worth Trying" image-led content grid
6. AI Signals feed with curated external links and recommendation reasons
7. "Ready to Use" block for foundational commands, prompts, paths, and configurations
8. Recent updates feed

Homepage categories:

- Inspiration
- Collaboration
- Productivity Tools
- Content Production
- Industry Outlook
- Cases
- Skills and MCP
- Getting Started

The number of homepage recommendations must be deliberately limited. The homepage should feel curated rather than exhaustive.

### 4.3 Listing and Detail Pages

Listing pages support keyword search, recommendation-track filtering, and featured/latest sorting.

Detail pages include:

- Title and concise summary
- Recommendation reason
- Applicable audience and scenario
- Cover image where relevant
- Source and publication information
- Public Feishu document preview card where relevant
- Copyable prompts, commands, paths, configuration, or code blocks
- Related content
- Clear link to the original source

## 5. Key User Interactions

### 5.1 Search and Discovery

Search covers titles, summaries, recommendation reasons, tags, source names, and copy-block labels. Search is performed against static public JSON in the browser. No Feishu API call is made from the browser.

### 5.2 Copy Actions

Prompts, commands, paths, configuration, and code blocks provide a copy icon with a tooltip. Copy success is shown through a short, non-layout-shifting state change.

### 5.3 Feishu Document Cards

Public Feishu document cards display an explicitly maintained title, summary, cover, tags, and source link. The site does not depend on runtime Open Graph scraping because Feishu metadata and image access may be inconsistent.

### 5.4 External Sources

External links display their source and open the original page. AI HOT content is curated manually; the site stores only the selected title, summary, recommendation reason, and source URL. It does not reproduce full articles.

## 6. Feishu Base Content Model

The CMS contains three tables.

### 6.1 Content Table

Each record represents one publishable item.

Required fields:

- Title
- Content Type
- Summary
- Publication Status
- Public Level

Core fields:

- Slug
- Content Type: Case, Inspiration, Collaboration, Tool, Skill, AI Signal, Getting Started
- Category
- Summary
- Recommendation Reason
- Cover Image
- Tags
- Applicable Audience
- Applicable Scenario
- Original URL
- Feishu Document URL
- Source Name
- Featured on Homepage
- Sort Weight
- Published At
- Updated At
- Publication Status: Draft, Published, Unlisted
- Public Level: Public, Desensitized Case, Forbidden
- Generated From Inbox Record

Publishing requires both `Publication Status = Published` and `Public Level != Forbidden`.

### 6.2 Copy Blocks Table

One content item may have multiple copyable blocks.

Fields:

- Related Content
- Block Title
- Block Type: Prompt, Command, Path, Configuration, Code
- Language: Shell, PowerShell, Markdown, JSON, YAML, Text, or another display language
- Content
- Display Order
- Optional Note

### 6.3 Inspiration Inbox Table

The inbox is a low-friction capture surface. An editor may paste a public URL, Feishu document, GitHub repository, AI HOT article, Skill instructions, prompt, code block, or plain-text idea.

Fields:

- Raw Content
- Editor Note
- Processing Status: Pending, Processing, Review Required, Processed, Failed
- Detected Source Type
- Suggested Content Type
- Suggested Category
- Generated Title
- Generated Summary
- Generated Recommendation Reason
- Source URL
- Related Draft Content Record
- Error Message
- Submitted At
- Processed At

AI processing creates a draft only. A human must review the draft and explicitly set it to Published.

## 7. Inbox Processing Workflow

The scheduled job processes pending inbox records before building the website.

1. Read pending inbox records.
2. Identify whether the input is a URL, Feishu document, GitHub repository, AI HOT article, code, prompt, or plain text.
3. Fetch only publicly accessible metadata and bounded page content.
4. Send a minimal, structured input to an OpenAI-compatible model.
5. Generate a proposed title, summary, recommendation reason, content type, category, and tags.
6. Extract copyable blocks where appropriate.
7. Create or update a Draft record in the Content table.
8. Create linked Copy Block records.
9. Mark the inbox item Review Required and link the generated draft.

The AI integration uses a provider-neutral OpenAI-compatible interface. The base URL, model, and API key are environment variables. The processing code must not depend on Codex++, a desktop session, or one provider's proprietary SDK.

## 8. System Architecture

### 8.1 Technology

- Astro for static pages and content routes
- Small React islands for search, filters, copy actions, and other client interactions
- Feishu Base as the content CMS
- GitHub Actions for scheduled synchronization and builds
- An OpenAI-compatible API for inbox enrichment
- Static hosting such as Cloudflare Pages or an equivalent low-cost platform

### 8.2 Data Flow

```text
Editor pastes content into Feishu Base Inbox
                    |
                    v
Scheduled GitHub Action every 6 hours
                    |
          Process pending inbox items
                    |
      Create human-reviewable drafts in Base
                    |
          Read approved published records
                    |
      Validate, sanitize, and download assets
                    |
          Generate public static JSON
                    |
              Astro static build
                    |
          Deploy only after all gates pass
```

A manual GitHub Actions dispatch provides an immediate sync option.

### 8.3 Repository Boundaries

The implementation should separate:

- Feishu API client and field mapping
- Inbox source detection and metadata extraction
- AI enrichment adapter
- Public content validation and sanitization
- Asset download and normalization
- Static content generation
- Astro pages and components
- React interaction islands

Each unit should expose a small typed interface and be testable without requiring a live deployment.

## 9. Security and Privacy

- Feishu app credentials and AI API credentials live only in GitHub Secrets or hosting secrets.
- The frontend never calls Feishu or the AI provider directly.
- Public JSON is built from an explicit field allowlist.
- Forbidden and Draft records are excluded before static artifacts are generated.
- Private Feishu links are not treated as public merely because metadata can be read by the sync account.
- Desensitized cases require an explicit Public Level selection.
- Raw inbox content is never included in the public bundle.
- Logs must not print credentials, authorization headers, full private document bodies, or model secrets.
- External page retrieval uses timeouts, size limits, and safe content-type checks.

## 10. Failure Handling

- AI API failure: mark the inbox item Failed or leave it retryable; do not affect website publication.
- Unsupported input: preserve the raw inbox record and request manual completion.
- External link fetch failure: create a minimal review draft when enough editor-provided context exists.
- Feishu API failure: abort the new build and keep the current deployed version.
- Invalid content record: skip the record, emit a clear validation error, and continue only if the remaining dataset is valid.
- Image failure: use a content-type fallback image and record the warning.
- Static build failure: do not deploy.
- Deployment failure: retain the previous live version.

## 11. Visual Design

The visual direction combines WayToAGI's discovery-oriented content browsing with the uploaded Stripe-style design reference.

### 11.1 Visual Character

- Quiet, precise, editorial, and work-focused
- Cool white canvas with deep navy text
- One indigo action color
- Image-led recommendations without becoming a marketing landing page
- Flat surfaces, hairline rules, and generous whitespace
- No shadows, blur, decorative gradients, or ornamental blobs

### 11.2 Core Tokens

- Primary text: `#061b31`
- Secondary text: `#64748d`
- Tertiary text: `#50617a`
- Canvas: `#ffffff`
- Quiet band: `#f8fafd`
- Divider and border: `#e5edf5`
- Primary action: `#533afd`
- Action hover: `#7389ff`
- Outline border: `#b9b9f9`
- Highlight wash: `#e8e9ff`

### 11.3 Typography

- Font stack: Inter, Noto Sans SC, system sans-serif
- Headings use weight 300 or 400
- Navigation and compact controls use weight 400
- Letter spacing is always `0`
- Fixed responsive type sizes are used; font size does not scale continuously with viewport width
- Hero heading target: 48px desktop and 36px mobile
- Section heading target: 32px desktop and 26px mobile
- Body target: 16px
- Compact metadata target: 12px to 14px

### 11.4 Shape and Layout

- Page maximum width: 1320px
- Base spacing unit: 8px
- Buttons, inputs, content cards, and document cards: maximum 4px radius
- Tags may use pill treatment only when they function as tags or filters
- Section separation uses whitespace and 1px rules
- Repeated content cards may use a 1px border or a quiet surface tint but no shadow
- Desktop discovery grid uses four columns where content width permits
- Mobile discovery grid uses one column, or two only for compact visual items with validated text fit

### 11.5 Imagery

- Images show the actual case, project, workflow, interface, or document whenever possible
- Featured editorial content may use a full-width image with readable text overlay
- Content cards use stable aspect ratios to avoid layout shift
- Generic decorative imagery is avoided
- Public Feishu document covers and external source images are downloaded during the build when permitted

### 11.6 Design Reference Reconciliation

The uploaded reference contains internal conflicts and rules that do not fit Chinese content discovery. The implementation resolves them as follows:

- Buttons use 4px radius, not the contradictory pill-button example.
- Letter spacing is 0, not negative.
- The site retains image-led discovery even though the reference recommends very limited imagery.
- Indigo remains a functional accent and is not used as a large decorative background.
- The initial MVP interpreted "frosted glass" as cool surface tinting. Section 17 supersedes this constraint for the approved quick-match tool only.

## 12. Accessibility and Responsive Behavior

- All interactive controls are keyboard accessible.
- Icon-only controls have visible tooltips and accessible labels.
- Text and controls meet practical contrast requirements.
- Cards have stable image ratios and content regions to prevent layout shift.
- Long Chinese titles wrap without covering metadata or adjacent controls.
- Copy feedback does not resize buttons or cards.
- External links indicate their source and destination behavior.
- Desktop and mobile layouts are verified at representative narrow, standard, and wide viewports.

## 13. Testing Strategy

### 13.1 Unit Tests

- Feishu field mapping
- Publication and public-level filtering
- Slug generation and duplicate handling
- Inbox source detection
- AI structured response validation
- Copy block extraction
- Asset URL normalization
- Public field allowlisting

### 13.2 Integration Tests

- Feishu API fixtures to public JSON
- Inbox item to review draft
- Published record to generated Astro route
- Failed AI request does not block publication
- Failed Feishu sync prevents deployment
- Unlisted and forbidden records are absent from output

### 13.3 UI Tests

- Search and recommendation-track filtering
- Featured/latest sorting
- Copy action and feedback
- Feishu document card links
- External source links
- Mobile navigation
- Text wrapping and non-overlap

### 13.4 Build and Visual Verification

- Production static build succeeds
- Generated public JSON contains no secret or private fields
- Playwright screenshots cover desktop and mobile home, listing, and detail pages
- Visual inspection checks empty states, long titles, missing images, and mixed Chinese/English content

## 14. Success Criteria

The MVP is successful when:

- A colleague can discover a useful AI work idea from the homepage without following a course.
- A colleague can find and copy a practical command, prompt, path, or configuration quickly.
- Public Feishu cases appear as useful preview cards and open the original document.
- An editor can paste arbitrary public material into the inbox and receive a reviewable draft.
- Only explicitly reviewed public content is deployed.
- Content changes can be made from Feishu Base without editing website code.
- A failed synchronization never replaces the working public site with an incomplete build.

## 15. MVP Exclusions

The first release does not include:

- User login or company SSO
- Comments, likes, favorites, or personal accounts
- Public user submissions
- Real-time synchronization
- Automatic publication without human review
- Full-article mirroring or unrestricted web crawling
- Personalized recommendations
- A rigid course-progress system
- A custom web-based CMS separate from Feishu Base

## 16. Delivery Sequence

1. Scaffold the Astro site and visual tokens.
2. Build fixture-driven homepage, listing, detail, search, filters, and copy interactions.
3. Define the three Feishu Base tables and field mappings.
4. Implement approved-content synchronization and static JSON generation.
5. Implement inbox processing and the OpenAI-compatible enrichment adapter.
6. Add scheduled and manual GitHub Actions workflows.
7. Add production hosting configuration and secret setup documentation.
8. Run unit, integration, UI, responsive, and security-output verification.

## 17. Chinese Typography and Liquid Glass Iteration

This iteration updates presentation only. It does not change the public content schema, recommendation scoring, Feishu mappings, routes, or publication workflow.

### 17.1 Typography

- Chinese UI text prefers `PingFang SC`, `Noto Sans CJK SC`, `Microsoft YaHei`, and compatible system sans-serif fallbacks.
- Display headings use medium weight rather than heavy bold so Chinese glyphs retain interior space.
- Body text remains regular weight with slightly more line height and softer graphite color.
- Metadata and labels remain compact but avoid semibold weight unless they represent an active state.
- Letter spacing remains `0`.

### 17.2 Quick-Match Layout

- The quick-match module remains one framed tool, not a page section styled as a decorative card.
- Desktop uses four balanced preference groups with additional vertical spacing; medium viewports use two columns and mobile uses one column.
- The heading, controls, and three recommendations are separated into clear bands with generous spacing.
- Recommendation rows keep stable title, reason, and takeaway dimensions so filter changes do not move the controls below them.
- Dividers organize recommendations without adding nested cards or shadows.

### 17.3 Glass Treatment

- The quick-match tool uses a translucent white surface, a restrained one-pixel border, and `backdrop-filter` blur plus saturation when supported.
- No decorative gradient, orb, shadow, or simulated glass illustration is added.
- Hover and selected states change surface opacity, border color, and position subtly; content remains readable without relying on transparency.
- Browsers without backdrop-filter receive an opaque fog-canvas fallback.

### 17.4 Motion

- The glass panel receives one short settle animation on initial render.
- Preference controls and recommendation links use brief state transitions; no looping animation is allowed.
- Motion does not resize controls or change document flow.
- `prefers-reduced-motion: reduce` disables transforms, animation, and nonessential transitions.

### 17.5 Acceptance Criteria

- Chinese headings no longer appear excessively heavy at desktop or mobile sizes.
- At 1440px, the quick-match controls read as four balanced groups with visible breathing room.
- The glass surface is perceptible over the page background while text contrast remains clear.
- Track and preference changes keep the lower search controls stable.
- Existing keyboard, clipboard, responsive, public-output, and security tests continue to pass.

