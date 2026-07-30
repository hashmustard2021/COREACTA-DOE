import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


class GoogleOAuthError(Exception):
    """Raised when Google cannot complete or validate an OAuth login."""


def google_login_enabled():
    return bool(settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET)


def authorization_url(state, nonce):
    query = urlencode(
        {
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "nonce": nonce,
            "prompt": "select_account",
        }
    )
    return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"


def exchange_code(code):
    payload = urlencode(
        {
            "code": code,
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
            "grant_type": "authorization_code",
        }
    ).encode("utf-8")
    request = Request(
        GOOGLE_TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            token_data = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError) as error:
        raise GoogleOAuthError("Google token exchange failed.") from error

    token = token_data.get("id_token")
    if not token:
        raise GoogleOAuthError("Google did not return an identity token.")
    return token


def verify_identity_token(token, expected_nonce):
    try:
        identity = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.GOOGLE_OAUTH_CLIENT_ID,
        )
    except ValueError as error:
        raise GoogleOAuthError("Google identity verification failed.") from error

    if identity.get("nonce") != expected_nonce:
        raise GoogleOAuthError("Google login verification did not match this request.")
    if not identity.get("email_verified") or not identity.get("email") or not identity.get("sub"):
        raise GoogleOAuthError("A verified Google email address is required.")
    return identity
