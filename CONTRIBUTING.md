# Contributing to VoltGet

Thank you for your interest in contributing to VoltGet! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

### Prerequisites

- Node.js 20+
- FFmpeg (system PATH or installed via `winget install Gyan.FFmpeg`)
- yt-dlp (auto-installed by VoltGet)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/eekilinc/VoltGet.git
cd VoltGet

# Install dependencies
npm install

# Start development mode
npm run dev
```

## Development Workflow

### Branching Strategy

- `main` - Stable releases only
- `develop` - Integration branch for features
- `feature/*` - Feature branches
- `fix/*` - Bug fix branches
- `release/*` - Release preparation branches

### Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm run test`
5. Run linting: `npm run lint`
6. Format code: `npm run format`
7. Commit with conventional commits: `git commit -m 'feat: add amazing feature'`
8. Push to your fork: `git push origin feature/amazing-feature`
9. Open a Pull Request

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or modifying tests
- `chore`: Maintenance tasks

Examples:

```
feat(downloader): add HLS fallback support
fix(queue): resolve pause/resume race condition
docs(readme): update installation instructions
```

## Code Style

### TypeScript

- Use strict TypeScript configuration
- Avoid `any` - use proper types
- Use interfaces for object shapes
- Prefer `type` for unions and primitives

### React

- Functional components with hooks
- Use TypeScript interfaces for props
- Keep components small and focused
- Use custom hooks for shared logic

### Electron

- Separate main/renderer processes clearly
- Use context isolation
- Prefer IPC for main/renderer communication
- Handle errors gracefully

### Testing

- Write unit tests for utilities
- Write integration tests for IPC handlers
- Use Vitest for unit tests
- Use Playwright for E2E tests

### Code Quality

Run before committing:

```bash
npm run lint    # ESLint
npm run format  # Prettier
npm run test    # Unit tests
npm run test:e2e  # E2E tests
```

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add changelog entry
4. Request review from maintainers
5. Address review comments
6. Squash commits if requested
7. Merge after approval

## Reporting Bugs

Use the [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md) when reporting bugs.

## Feature Requests

Use the [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.md) for new features.

## Security

Report security vulnerabilities via [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to VoltGet! ⚡
