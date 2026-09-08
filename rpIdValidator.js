/**
 * WebAuthn RP ID validation for trusted extension contexts.
 * Requires the vendored tldts UMD bundle to be loaded first.
 */

'use strict';

(function installRpIdValidator(scope) {
  const domainParser = scope.tldts;

  if (!domainParser || typeof domainParser.parse !== 'function') {
    throw new Error('PassHub RP ID validator requires tldts');
  }

  function securityError(message) {
    return new DOMException(message, 'SecurityError');
  }

  function canonicalizeDomain(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) {
      throw securityError(`${fieldName} must be a non-empty domain`);
    }

    // An RP ID is a domain only: it cannot contain a scheme, port, path,
    // credentials, query, fragment, brackets, or whitespace.
    if (/[/\\:@?#\[\]\s]/.test(value)) {
      throw securityError(`${fieldName} must contain only a domain name`);
    }

    let hostname;
    try {
      hostname = new URL(`https://${value}/`).hostname.toLowerCase();
    } catch (error) {
      throw securityError(`${fieldName} is not a valid domain`);
    }

    const parsed = domainParser.parse(hostname, {
      allowPrivateDomains: true,
      validateHostname: true
    });

    if (!parsed.hostname || parsed.isIp) {
      throw securityError(`${fieldName} is not a valid domain`);
    }

    return { hostname, parsed };
  }

  function validate(rpId, pageUrl) {
    let callerUrl;
    try {
      callerUrl = new URL(pageUrl);
    } catch (error) {
      throw securityError('The relying party URL is invalid');
    }

    const effectiveDomain = canonicalizeDomain(
      callerUrl.hostname,
      'The relying party origin host'
    ).hostname;

    const isHttps = callerUrl.protocol === 'https:';
    const isLocalhostHttp = callerUrl.protocol === 'http:' && effectiveDomain === 'localhost';
    if (!isHttps && !isLocalhostHttp) {
      throw securityError('WebAuthn requires HTTPS, except for http://localhost');
    }

    const requested = canonicalizeDomain(
      rpId === undefined || rpId === null ? effectiveDomain : rpId,
      'RP ID'
    );

    if (requested.hostname === effectiveDomain) {
      return {
        origin: callerUrl.origin,
        rpId: requested.hostname
      };
    }

    const isDomainSuffix = effectiveDomain.endsWith(`.${requested.hostname}`);
    const isRegistrableDomain = requested.parsed.domain !== null;
    if (!isDomainSuffix || !isRegistrableDomain) {
      throw securityError('RP ID is not a registrable domain suffix of the relying party origin');
    }

    return {
      origin: callerUrl.origin,
      rpId: requested.hostname
    };
  }

  scope.PassHubRpIdValidator = Object.freeze({ validate });
})(globalThis);
