# Security Policy

## Supported Versions

We release security updates for the following versions:

| Version | Supported |
| ------- | --------- |
| 1.0.x   | ✅ Yes    |
| < 1.0   | ❌ No     |

## Reporting a Vulnerability

If you discover a security vulnerability in VoltGet, please report it responsibly:

### Private Disclosure

**Please do NOT create a public GitHub issue for security vulnerabilities.**

Instead, please email us at: **security@voltget.app** (or create a private security advisory on GitHub)

Include the following information:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 5 business days
- **Fix Timeline**: Depends on severity
  - Critical: Within 7 days
  - High: Within 14 days
  - Medium: Within 30 days
  - Low: Next release cycle

## Security Features

VoltGet implements several security measures:

### Process Isolation

- Context isolation enabled in renderer processes
- Node integration disabled in renderer
- Preload scripts for controlled IPC
- Sandbox enabled where possible

### Network Security

- HTTPS enforced for all external requests
- User-Agent spoofing prevention
- Referer/Origin headers properly set
- No execution of downloaded scripts

### File System

- Downloads saved to user-selected directories only
- No arbitrary file execution
- Temporary files cleaned up after download
- No path traversal in download paths

### Dependency Management

- Regular dependency auditing (`npm audit`)
- Pinned dependency versions
- Minimal external dependencies
- Electron version kept up to date

## Known Security Considerations

### yt-dlp & FFmpeg

- External binaries executed with controlled arguments
- No shell injection (spawn without shell)
- Input validation on URLs and arguments
- Sandboxed execution where possible

### Browser Extensions

- Manifest V3 for Chrome/Edge
- Minimal permissions requested
- Content scripts isolated from page context
- No access to sensitive browser APIs

### IPC Communication

- Context isolation enforced
- Preload scripts validate all messages
- No direct Node.js API exposure to renderer
- Message validation on both sides

## Security Best Practices for Contributors

1. **Never commit secrets** - Use environment variables
2. **Validate all inputs** - Both renderer and main process
3. **Use typed IPC** - Define interfaces for all messages
4. **Avoid `eval()` and `Function()`** - Never execute dynamic code
5. **Keep dependencies updated** - Regular `npm audit`
6. **Test security features** - Add tests for security fixes

## Disclosure Policy

When a security vulnerability is confirmed:

1. We will release a patch as soon as possible
2. We will publish a security advisory
3. We will credit the reporter (if desired)
4. We will update the changelog

## Contact

For security-related questions or concerns:

- Email: security@voltget.app
- GitHub Security Advisories: [Private Advisory](https://github.com/eekilinc/VoltGet/security/advisories/new)

---

Thank you for helping keep VoltGet secure! 🔒
