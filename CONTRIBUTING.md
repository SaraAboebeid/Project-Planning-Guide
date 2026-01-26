# Contributing to Project Planning Guide

Thank you for your interest in contributing to the Project Planning Guide Dashboard! This document provides guidelines for contributing to the project.

## 🤝 How to Contribute

### Reporting Bugs

If you find a bug, please open an issue with:
- **Title**: Brief description of the bug
- **Description**: Detailed explanation of the issue
- **Steps to Reproduce**: Clear steps to recreate the bug
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Environment**: OS, Python version, browser
- **Screenshots**: If applicable

### Suggesting Enhancements

For feature requests:
- **Title**: Clear feature name
- **Description**: Detailed explanation of the feature
- **Use Case**: Why this feature would be useful
- **Mockups**: Visual representations if applicable

### Pull Requests

1. **Fork the Repository**
2. **Create a Branch**: `git checkout -b feature/YourFeatureName`
3. **Make Changes**: Follow coding standards below
4. **Test Thoroughly**: Ensure all features work
5. **Commit**: Use clear commit messages
6. **Push**: `git push origin feature/YourFeatureName`
7. **Open PR**: Describe changes and link related issues

## 📝 Coding Standards

### Python Style
- Follow PEP 8 guidelines
- Use meaningful variable names
- Add docstrings to functions
- Keep functions focused and small

### Streamlit Best Practices
- Use st.cache_data for expensive computations
- Organize code with clear sections
- Use columns for layout management
- Provide helpful tooltips and captions

### Comments
- Explain complex logic
- Document non-obvious decisions
- Keep comments up-to-date with code

## 🧪 Testing

Before submitting:
1. Test all three project scales
2. Verify budget allocation warnings
3. Check export functionality (CSV & Excel)
4. Test risk assessment calculations
5. Verify Gantt chart generation
6. Test on different browsers

## 📋 Project Structure Guidelines

When adding new features:
- Keep related code together
- Use session state appropriately
- Maintain consistent naming conventions
- Update README with new features
- Add to QUICK_START if user-facing

## 🎨 UI/UX Guidelines

- Maintain consistent emoji usage (🏗️ 📊 📅 ⚠️ 📑)
- Use appropriate Streamlit components
- Provide clear user feedback (success/warning/error)
- Keep interface intuitive and clean
- Test on different screen sizes

## 📚 Documentation

When adding features, update:
- README.md with feature description
- QUICK_START.md if relevant for users
- Code comments for developers
- This CONTRIBUTING.md if process changes

## 🔄 Development Workflow

1. **Pull latest changes**: `git pull origin main`
2. **Create feature branch**: `git checkout -b feature/name`
3. **Develop and test**
4. **Commit frequently** with clear messages
5. **Push and create PR**
6. **Address review feedback**
7. **Merge when approved**

## ✅ Pre-submission Checklist

- [ ] Code follows style guidelines
- [ ] All features tested manually
- [ ] No console errors or warnings
- [ ] Documentation updated
- [ ] Commit messages are clear
- [ ] PR description is complete

## 🏷️ Version Control

### Commit Message Format
```
type(scope): description

[optional body]
[optional footer]
```

**Types**: feat, fix, docs, style, refactor, test, chore

**Examples**:
- `feat(budget): add quarterly breakdown view`
- `fix(export): resolve Excel generation error`
- `docs(readme): update installation instructions`

## 🎯 Priority Areas

Looking for contributions in:
- Database integration for persistent storage
- PDF report generation
- Mobile responsiveness improvements
- Additional visualization types
- Performance optimizations
- Internationalization (i18n)

## 📞 Questions?

- Open a discussion on GitHub
- Check existing issues and PRs
- Review documentation thoroughly

## 🙏 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what's best for the project
- Welcome newcomers and help them contribute

---

Thank you for contributing to Project Planning Guide! 🎉
