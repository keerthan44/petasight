Chatbot Assignment — Thinking Process & AI Tooling
Overview
This document outlines how I approached the assignment, the decisions I made along the way, and the AI tools I used to accelerate development.

Thinking Process
1. Breaking Down the Hard Problem First
Before writing a single line of code, I identified the core technical challenge: correctly implementing the three-way conditional logic with the right order of precedence — temperature extraction, decimal parsing, and urgency detection. Getting these to not collide with each other required careful design.
My solution was to use a two-LLM-call architecture (which I came up with independently):

Call 1 returns a structured output that classifies the user's input and extracts the relevant data (city + temperature, decimal value, or urgency score).
Call 2 uses that classification to generate the actual chatbot response in the correct persona and language.

This separation of concerns made the logic clean and testable. I could verify classification was working correctly before worrying about the generated text at all.
2. Prompt Engineering via ChatGPT
To avoid burning Claude Code tokens on planning and prompt iteration, I used ChatGPT as a low-cost drafting environment. I described the two-LLM architecture and the full requirements to ChatGPT and asked it to generate a well-structured prompt I could feed into Claude Code's plan mode. This let me go into Claude Code with a clear, high-quality brief rather than iterating from scratch.
3. Building the Core Logic in Claude Code
I fed the ChatGPT-generated prompt into Claude Code in plan mode first, reviewed the plan, then executed it. I deliberately deferred color implementation to the frontend phase — I focused only on getting the classification logic and precedence order correct.
After a few iterations, the temperature capture, decimal parsing, and urgency precedence were all working as expected. I reviewed the codebase structure manually and also ran it through Claude Code's built-in code quality plugin — both checks passed, so I moved on.
4. Frontend Design
I'm not someone who naturally enjoys building polished UIs, so I explored options:

I tried Bolt.new with their Next.js solution in parallel.
I also discovered a frontend-design skill/plugin within Claude Code and tried that.

I ended up going with the Claude frontend-design plugin approach — it produced a cleaner result that I was happy with. I discarded the Bolt.new direction.
After the UI looked good, I layered in the color logic that I had intentionally left out during the core logic phase.
5. WCAG 2.0 Accessibility
I didn't want to handle accessibility manually, so I used an open-source Claude plugin — accessibility-agents — to run an automated compliance pass. This handled a range of WCAG requirements including, notably, making RTL language input actually render right-to-left in the text field.
After the automated pass, I ran the WAVE browser extension to catch anything the plugin missed. WAVE flagged some contrast ratio issues with dynamic text colors. I fed those findings back into Claude Code, which resolved them.
6. Authentication / SSO
With the chatbot complete, I turned to the authentication requirement. I went back to ChatGPT (again to save tokens) and asked: given what I've built, what's the fastest SSO provider to integrate? It recommended Firebase, which I was already familiar with — so I didn't second-guess it.
I asked ChatGPT to generate the integration prompt, fed it to Claude Code, and set up the Firebase project in parallel. By the time Claude Code had the integration scaffolded, I just needed to drop in my credentials via environment variables. Google SSO worked immediately.
Since I wasn't sure what email provider PetaSight uses internally, I also added email/password authentication via Firebase as a fallback, restricting access to @petasight.com addresses.
After SSO was wired up, I ran another WCAG pass and a final code quality check — both clean.

AI & Development Tools Used
ToolHow I Used ItChatGPTLow-cost prompt drafting; generating prompts to feed into Claude Code; SSO provider recommendationClaude CodePrimary development environment; plan mode for architecture; code generation and iteration; code quality reviewClaude frontend-design pluginUI design and component generationClaude accessibility-agents pluginAutomated WCAG 2.0 compliance pass; RTL input rendering fixWAVE Browser ExtensionManual accessibility audit; identifying contrast ratio issues post-automationBolt.newExplored as a parallel frontend option; ultimately discardedFirebaseAuthentication provider (Google SSO + email/password with @petasight.com restriction)

Key Design Decision
The most deliberate technical decision I made was the two-LLM-call pattern. Rather than asking a single LLM call to both classify the input and generate a response, I split them. This made the conditional color logic deterministic and easy to test — the structured output from Call 1 drove styling, and Call 2 only had to worry about generating the right text in the right persona. It also made debugging much easier since each concern was isolated.