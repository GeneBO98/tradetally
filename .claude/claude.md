# Claude – Code Contribution Guidelines

## 📌 Purpose
This document outlines best practices for contributing to this project.  
It exists to ensure:
- Code remains **maintainable**, **readable**, and **functional** over time.
- New features do not accidentally break existing, working functionality.
- All developers follow consistent patterns in **JavaScript** and **Vue**.

---

## 🛠 Best Practices

### 1. **Do Not Change Functional Code Without Necessity**
- If a function or layout **currently works** and **meets requirements**, **do not modify it** unless:
  1. There is a confirmed bug.
  2. A new feature **requires** the change.
- Example:  
  Our **CSV import** and **trade import** functionality has historically been fragile.  
  Any change here must be:
  - Justified by a clear business need.
  - Tested extensively with various input formats.
  - Documented clearly in the commit message and pull request.

---

### 2. **Write Clean, Readable Code**
- Follow **JavaScript Standard Style** or **ESLint** rules configured in the project.
- Use **descriptive variable and function names**.
- Keep functions **small** and **single-purpose**.
- Avoid deeply nested conditionals; refactor into smaller methods where possible.

---

### 3. **Vue Component Guidelines**
- Use **single-file components** (`.vue`) with `<template>`, `<script>`, and `<style>` sections.
- Keep **template markup clean**:
  - Use `v-if` / `v-for` judiciously.
  - Avoid complex logic in the template—move it to computed properties or methods.
- Use **props** for passing data down, **events** or **emits** for sending data up.
- Keep components **focused**—do not make “god components” that handle too much.

---

### 4. **Testing Before Committing**
- **Run the application locally** before committing changes.
- Test **critical paths**, especially:
  - CSV import
  - Trade import
  - Authentication and routing
- If adding new features, write corresponding unit or integration tests when possible.

---

### 5. **Git Practices**
- Use **feature branches** (e.g., `feature/add-user-profile`) for new features.
- Use **descriptive commit messages**:
  - ✅ Good: `Fix CSV import edge case when field is missing`
  - ❌ Bad: `Fixed stuff`
- Reference related issues or tickets in commits and pull requests.

---

### 6. **Pull Request Review**
- Every PR should:
  - Explain **what** the change is and **why** it was needed.
  - List **any affected parts** of the application.
  - Include **testing notes** for reviewers.

---

## 🚫 Common Pitfalls to Avoid
- **Refactoring for style only** without functional benefit.
- **Changing working imports** without testing against real-world data.
- **Mixing unrelated changes** in a single commit or PR.

---

## ✅ Summary
Think twice before changing working, business-critical code—especially in historically fragile areas like CSV imports and trade imports.  
If it’s not broken **and** not blocking a new feature, leave it as is.

> _"Stable features are like Jenga towers: you can add to them carefully, but pulling pieces out at random will make the whole thing collapse."_
