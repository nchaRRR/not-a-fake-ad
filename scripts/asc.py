#!/usr/bin/env python3
"""App Store Connect API helper for CI signing (no Mac, no stored certificate).

  asc.py setup   <workdir>   create a temporary Apple Distribution certificate (from a fresh key/CSR in
                             <workdir>) + an App Store provisioning profile; writes <workdir>/signing.json
  asc.py cleanup <workdir>   nothing to revoke: the certificate + profile of this run stay alive until the NEXT run's
                             setup, because Apple validates the signature while it processes the upload (after the
                             workflow ends). Revoking right after the upload made build 5 "Invalid Binary" (ITMS-90035).

Env: APPSTORE_KEY_ID, APPSTORE_ISSUER_ID, APPSTORE_KEY_PATH (the .p8), BUNDLE_ID, RUN_ID
setup revokes the certificate of every older "NotAFakeAd CI" profile (by then Apple has long finished processing
that build), so at most one CI certificate exists at a time. Revoking does not affect processed/approved builds.
"""
import base64, json, os, subprocess, sys, time, urllib.error, urllib.request

import jwt  # PyJWT (+ cryptography)

API = 'https://api.appstoreconnect.apple.com/v1'
PREFIX = 'NotAFakeAd CI'  # her uygulamanın CI sertifikası ayrı (Kelime Köyü: 'KelimeKoyu CI', Köstebek Avcısı: 'Kostebek CI')


def token():
    key = open(os.environ['APPSTORE_KEY_PATH']).read()
    now = int(time.time())
    return jwt.encode({'iss': os.environ['APPSTORE_ISSUER_ID'], 'iat': now, 'exp': now + 1100, 'aud': 'appstoreconnect-v1'},
                      key, algorithm='ES256', headers={'kid': os.environ['APPSTORE_KEY_ID'], 'typ': 'JWT'})


def call(method, path, body=None):
    req = urllib.request.Request(API + path if path.startswith('/') else path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors='replace')
        print(f'::error::App Store Connect API {method} {path} → {e.code}: {msg[:600]}')
        raise


def sh(*a):
    subprocess.run(a, check=True)


CI_PREFIXES = ('KelimeKoyu CI', 'Kostebek CI', 'NotAFakeAd CI')


def free_oldest_ci_certificate():
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    found = []
    for p in call('GET', '/profiles?limit=200&fields[profiles]=name')['data']:
        if not p['attributes']['name'].startswith(CI_PREFIXES):
            continue
        for c in call('GET', '/profiles/' + p['id'] + '/certificates?fields[certificates]=expirationDate,name')['data']:
            exp = datetime.fromisoformat(c['attributes']['expirationDate'].replace('Z', '+00:00'))
            created = exp - timedelta(days=365)
            found.append((created, c['id'], p['id'], p['attributes']['name']))
    old = sorted(x for x in found if now - x[0] > timedelta(hours=1))
    if not old:
        print('::error::Apple says the team has too many distribution certificates, and none of them belongs to an '
              'older CI run of our games. developer.apple.com → Certificates: revoke one old "Apple Distribution" certificate.')
        sys.exit(1)
    created, cert_id, prof_id, prof_name = old[0]
    call('DELETE', '/certificates/' + cert_id)
    try:
        call('DELETE', '/profiles/' + prof_id)
    except Exception:
        pass
    print(f'::notice::Certificate limit reached: revoked the CI certificate of "{prof_name}" (created {created:%Y-%m-%d}) to make room.')


def setup(wd):
    os.makedirs(wd, exist_ok=True)
    bundle = os.environ['BUNDLE_ID']
    # previous runs: revoke their certificate, delete their profile
    for p in call('GET', '/profiles?limit=200&fields[profiles]=name')['data']:
        if p['attributes']['name'].startswith(PREFIX):
            for c in call('GET', '/profiles/' + p['id'] + '/certificates?fields[certificates]=name')['data']:
                try:
                    call('DELETE', '/certificates/' + c['id'])
                    print('revoked old CI certificate', c['id'])
                except Exception:
                    pass
            call('DELETE', '/profiles/' + p['id'])
    key, csr = os.path.join(wd, 'key.pem'), os.path.join(wd, 'csr.pem')
    sh('/usr/bin/openssl', 'genrsa', '-out', key, '2048')
    sh('/usr/bin/openssl', 'req', '-new', '-key', key, '-out', csr, '-subj', '/CN=NotAFakeAd CI/C=TR')
    body = {'data': {'type': 'certificates', 'attributes': {'certificateType': 'DISTRIBUTION', 'csrContent': open(csr).read()}}}
    try:
        cert = call('POST', '/certificates', body)['data']
    except urllib.error.HTTPError as e:
        if e.code != 409:
            raise
        # The team is at Apple's limit of distribution certificates. Our games' CI runs
        # (Kelime Köyü, Köstebek Avcısı, Not a Fake Ad) each keep one alive; free the oldest of
        # those that is more than an hour old. Revoking does not affect processed or approved builds.
        free_oldest_ci_certificate()
        cert = call('POST', '/certificates', body)['data']
    state = {'certificate': cert['id']}
    json.dump(state, open(os.path.join(wd, 'signing.json'), 'w'))
    der = os.path.join(wd, 'cert.cer')
    open(der, 'wb').write(base64.b64decode(cert['attributes']['certificateContent']))
    sha1 = subprocess.run(['/usr/bin/openssl', 'x509', '-inform', 'der', '-in', der, '-noout', '-fingerprint', '-sha1'],
                          check=True, capture_output=True, text=True).stdout.split('=')[1].strip().replace(':', '')
    bids = [b for b in call('GET', '/bundleIds?filter[identifier]=' + bundle + '&limit=50')['data']
            if b['attributes']['identifier'] == bundle]
    if not bids:
        # First build of a new app: register its App ID (same as developer.apple.com → Identifiers → +)
        name = os.environ.get('APP_NAME', bundle.split('.')[-1])
        bids = [call('POST', '/bundleIds', {'data': {'type': 'bundleIds', 'attributes': {
            'identifier': bundle, 'name': name, 'platform': 'IOS'}}})['data']]
        print(f'::notice::Registered the App ID {bundle} ("{name}") on developer.apple.com')
    name = f"{PREFIX} {os.environ.get('RUN_ID', int(time.time()))}"
    prof = call('POST', '/profiles', {'data': {'type': 'profiles', 'attributes': {'name': name, 'profileType': 'IOS_APP_STORE'},
                                               'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bids[0]['id']}},
                                                                 'certificates': {'data': [{'type': 'certificates', 'id': cert['id']}]}}}})['data']
    state.update({'profile': prof['id'], 'profileName': name, 'profileUuid': prof['attributes']['uuid'], 'sha1': sha1})
    json.dump(state, open(os.path.join(wd, 'signing.json'), 'w'))
    open(os.path.join(wd, 'profile.mobileprovision'), 'wb').write(base64.b64decode(prof['attributes']['profileContent']))
    print('certificate', cert['id'], 'profile', name, prof['attributes']['uuid'])


def cleanup(wd):
    """Only after a FAILED run (nothing uploaded): revoke right away."""
    try:
        st = json.load(open(os.path.join(wd, 'signing.json')))
    except FileNotFoundError:
        return
    if st.get('profile'):
        try:
            call('DELETE', '/profiles/' + st['profile'])
        except Exception:
            pass
    if st.get('certificate'):
        call('DELETE', '/certificates/' + st['certificate'])
        print('revoked temporary certificate', st['certificate'])


if __name__ == '__main__':
    {'setup': setup, 'cleanup': cleanup}[sys.argv[1]](sys.argv[2])
