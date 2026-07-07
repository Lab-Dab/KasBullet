# KasBullet Engineering Standards

Version: 1.0

---

# Mission

KasBullet is a macro intelligence platform that helps investors understand Kaspa through the lens of global markets, macroeconomic conditions, and on-chain data.

Every engineering decision must support this mission.

---

# Engineering Principles

## 1. Build for the long term.

Never choose the quickest solution over the correct one.

---

## 2. Simplicity over cleverness.

Code should be easy to understand.

Prefer readable code over complex code.

---

## 3. Reuse before rewriting.

If something can become a reusable component, make it reusable.

---

## 4. One responsibility per file.

Every file should have one clearly defined purpose.

---

## 5. Every feature answers an investor question.

If a feature does not improve understanding of Kaspa, it should not exist.

---

# HTML Standards

Use semantic HTML.

Always prefer:

- header
- nav
- main
- section
- article
- aside
- footer

Avoid unnecessary div elements.

Every page must:

- contain exactly one main element
- include proper headings
- include accessible labels
- be keyboard navigable

---

# CSS Standards

Never use inline styles.

Never hard-code colors.

Always use variables from variables.css.

Use the spacing scale.

Avoid duplicated rules.

Prefer reusable utility classes.

One CSS file = one responsibility.

---

# JavaScript Standards

Never use inline JavaScript.

Avoid global variables.

Keep functions small.

Function names should describe actions.

Good examples:

initializeDashboard()

renderMarketContext()

updateLiquidityPanel()

Bad examples:

test()

run()

doStuff()

---

# Components

Every reusable component should have:

Purpose

Inputs

Outputs

Dependencies

---

# Performance

Minimize JavaScript.

Prefer CSS over JavaScript where possible.

Load only what is needed.

Avoid unnecessary libraries.

Optimize images.

---

# Accessibility

Use semantic HTML.

Support keyboard navigation.

Maintain sufficient color contrast.

Do not rely only on color to communicate meaning.

---

# Responsive Design

Mobile first.

Support:

Desktop

Tablet

Mobile

No feature is considered complete until responsive.

---

# Git Workflow

Every completed milestone receives its own commit.

Commit messages should be short and descriptive.

Examples:

Initialize design system

Create application shell

Build dashboard layout

Implement market context panel

Avoid commits such as:

Update

Changes

Fix stuff

Final version

---

# Review Checklist

Before committing:

✓ Code is readable

✓ No duplicated logic

✓ Responsive

✓ Uses design system

✓ Accessible

✓ No console errors

✓ Performance considered

✓ Purpose is clear

---

# Definition of Done

A task is complete only when:

It works.

It follows the design system.

It is responsive.

It is documented where necessary.

It passes review.

It can be merged without further cleanup.

---

# The KasBullet Standard

Every line of code should make the platform:

More understandable.

More maintainable.

More scalable.

More useful to investors.

Never accept "good enough."

Build it once.

Build it properly.

---

# Core Philosophy

We are not building another cryptocurrency dashboard.

We are building a financial intelligence platform.

Every chart must answer a question.

Every panel must provide context.

Every metric must have a purpose.

Every interaction should help investors better understand Kaspa.

When faced with two engineering decisions, choose the one that makes the platform easier to maintain, easier to extend, and easier to trust.