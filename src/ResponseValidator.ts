// Copyright (c) Brock Allen & Dominick Baier. All rights reserved.
// Licensed under the Apache License, Version 2.0. See LICENSE in the project root for license information.

import { Log, JoseUtil, Timer } from "./utils";
import { MetadataService } from "./MetadataService";
import { UserInfoService } from "./UserInfoService";
import { TokenClient } from "./TokenClient";
import { ErrorResponse } from "./ErrorResponse";
import { OidcClientSettingsStore } from "./OidcClientSettings";
import { SigninState } from "./SigninState";
import { SigninResponse } from "./SigninResponse";
import { State } from "./State";
import { SignoutResponse } from "./SignoutResponse";

const ProtocolClaims = ["nonce", "at_hash", "iat", "nbf", "exp", "aud", "iss", "c_hash"];

export class ResponseValidator {
    protected readonly _settings: OidcClientSettingsStore;
    protected readonly _metadataService: MetadataService;
    protected readonly _userInfoService: UserInfoService;
    protected readonly _tokenClient: TokenClient;

    public constructor(settings: OidcClientSettingsStore, metadataService: MetadataService) {
        this._settings = settings;
        this._metadataService = metadataService;
        this._userInfoService = new UserInfoService(this._settings, metadataService);
        this._tokenClient = new TokenClient(this._settings, metadataService);
    }

    public async validateSigninResponse(state: SigninState, response: SigninResponse): Promise<SigninResponse> {
        Log.debug("ResponseValidator.validateSigninResponse");

        response = this._processSigninParams(state, response);
        Log.debug("ResponseValidator.validateSigninResponse: state processed");

        response = await this._validateTokens(state, response);
        Log.debug("ResponseValidator.validateSigninResponse: tokens validated");

        response = await this._processClaims(state, response);
        Log.debug("ResponseValidator.validateSigninResponse: claims processed");

        return response;
    }

    public validateSignoutResponse(state: State, response: SignoutResponse): SignoutResponse {
        if (state.id !== response.state) {
            Log.error("ResponseValidator.validateSignoutResponse: State does not match");
            throw new Error("State does not match");
        }

        // now that we know the state matches, take the stored data
        // and set it into the response so callers can get their state
        // this is important for both success & error outcomes
        Log.debug("ResponseValidator.validateSignoutResponse: state validated");
        response.state = state.data;

        if (response.error) {
            Log.warn("ResponseValidator.validateSignoutResponse: Response was error", response.error);
            throw new ErrorResponse(response);
        }

        return response;
    }

    protected _processSigninParams(state: SigninState, response: SigninResponse): SigninResponse {
        if (state.id !== response.state) {
            Log.error("ResponseValidator._processSigninParams: State does not match");
            throw new Error("State does not match");
        }

        if (!state.client_id) {
            Log.error("ResponseValidator._processSigninParams: No client_id on state");
            throw new Error("No client_id on state");
        }

        if (!state.authority) {
            Log.error("ResponseValidator._processSigninParams: No authority on state");
            throw new Error("No authority on state");
        }

        // ensure we're using the correct authority
        if (this._settings.authority !== state.authority) {
            Log.error("ResponseValidator._processSigninParams: authority mismatch on settings vs. signin state");
            throw new Error("authority mismatch on settings vs. signin state");
        }
        if (this._settings.client_id && this._settings.client_id !== state.client_id) {
            Log.error("ResponseValidator._processSigninParams: client_id mismatch on settings vs. signin state");
            throw new Error("client_id mismatch on settings vs. signin state");
        }

        // now that we know the state matches, take the stored data
        // and set it into the response so callers can get their state
        // this is important for both success & error outcomes
        Log.debug("ResponseValidator._processSigninParams: state validated");
        response.state = state.data;

        if (response.error) {
            Log.warn("ResponseValidator._processSigninParams: Response was error", response.error);
            throw new ErrorResponse(response);
        }

        if (state.nonce && !response.id_token) {
            Log.error("ResponseValidator._processSigninParams: Expecting id_token in response");
            throw new Error("No id_token in response");
        }

        if (!state.nonce && response.id_token) {
            Log.error("ResponseValidator._processSigninParams: Not expecting id_token in response");
            throw new Error("Unexpected id_token in response");
        }

        if (state.code_verifier && !response.code) {
            Log.error("ResponseValidator._processSigninParams: Expecting code in response");
            throw new Error("No code in response");
        }

        if (!state.code_verifier && response.code) {
            Log.error("ResponseValidator._processSigninParams: Not expecting code in response");
            throw new Error("Unexpected code in response");
        }

        if (!response.scope) {
            // if there's no scope on the response, then assume all scopes granted (per-spec) and copy over scopes from original request
            response.scope = state.scope;
        }

        return response;
    }

    protected async _processClaims(state: SigninState, response: SigninResponse): Promise<SigninResponse> {
        if (response.isOpenIdConnect) {
            Log.debug("ResponseValidator._processClaims: response is OIDC, processing claims");

            response.profile = this._filterProtocolClaims(response.profile);

            if (state.skipUserInfo !== true && this._settings.loadUserInfo && response.access_token) {
                Log.debug("ResponseValidator._processClaims: loading user info");

                const claims  = await this._userInfoService.getClaims(response.access_token);
                Log.debug("ResponseValidator._processClaims: user info claims received from user info endpoint");

                if (claims.sub !== response.profile.sub) {
                    Log.error("ResponseValidator._processClaims: sub from user info endpoint does not match sub in id_token");
                    throw new Error("sub from user info endpoint does not match sub in id_token");
                }

                response.profile = this._mergeClaims(response.profile, claims);
                Log.debug("ResponseValidator._processClaims: user info claims received, updated profile:", response.profile);

                return response;
            }
            else {
                Log.debug("ResponseValidator._processClaims: not loading user info");
            }
        }
        else {
            Log.debug("ResponseValidator._processClaims: response is not OIDC, not processing claims");
        }

        return response;
    }

    protected _mergeClaims(claims1: any, claims2: any): any {
        const result = Object.assign({}, claims1);

        for (const name in claims2) {
            let values = claims2[name];
            if (!Array.isArray(values)) {
                values = [values];
            }

            for (let i = 0; i < values.length; i++) {
                const value = values[i];
                if (!result[name]) {
                    result[name] = value;
                }
                else if (Array.isArray(result[name])) {
                    if (result[name].indexOf(value) < 0) {
                        result[name].push(value);
                    }
                }
                else if (result[name] !== value) {
                    if (typeof value === "object" && this._settings.mergeClaims) {
                        result[name] = this._mergeClaims(result[name], value);
                    }
                    else {
                        result[name] = [result[name], value];
                    }
                }
            }
        }

        return result;
    }

    protected _filterProtocolClaims(claims: any): any {
        Log.debug("ResponseValidator._filterProtocolClaims, incoming claims:", claims);

        const result = Object.assign({}, claims);

        if (this._settings.filterProtocolClaims) {
            ProtocolClaims.forEach(type => {
                delete result[type];
            });

            Log.debug("ResponseValidator._filterProtocolClaims: protocol claims filtered", result);
        }
        else {
            Log.debug("ResponseValidator._filterProtocolClaims: protocol claims not filtered");
        }

        return result;
    }

    protected async _validateTokens(state: SigninState, response: SigninResponse): Promise<SigninResponse> {
        if (response.code) {
            Log.debug("ResponseValidator._validateTokens: Validating code");
            return this._processCode(state, response);
        }

        if (response.id_token) {
            if (response.access_token) {
                Log.debug("ResponseValidator._validateTokens: Validating id_token and access_token");
                const access_token = response.access_token;
                response = await this._validateIdToken(state, response, response.id_token);
                return this._validateAccessToken(response, access_token);
            }

            Log.debug("ResponseValidator._validateTokens: Validating id_token");
            return this._validateIdToken(state, response, response.id_token);
        }

        Log.debug("ResponseValidator._validateTokens: No code to process or id_token to validate");
        return response;
    }

    protected async _processCode(state: SigninState, response: SigninResponse): Promise<SigninResponse> {
        const request = {
            client_id: state.client_id,
            client_secret: state.client_secret,
            code : response.code,
            redirect_uri: state.redirect_uri,
            code_verifier: state.code_verifier || ""
        };

        if (state.extraTokenParams && typeof(state.extraTokenParams) === "object") {
            Object.assign(request, state.extraTokenParams);
        }

        const tokenResponse = await this._tokenClient.exchangeCode(request);
        // merge
        response.error = tokenResponse.error || response.error;
        response.error_description = tokenResponse.error_description || response.error_description;
        response.error_uri = tokenResponse.error_uri || response.error_uri;

        response.id_token = tokenResponse.id_token || response.id_token;
        response.session_state = tokenResponse.session_state || response.session_state;
        response.access_token = tokenResponse.access_token || response.access_token;
        response.token_type = tokenResponse.token_type || response.token_type;
        response.scope = tokenResponse.scope || response.scope;
        response.expires_in = parseInt(tokenResponse.expires_in) || response.expires_in;

        if (response.id_token) {
            Log.debug("ResponseValidator._processCode: token response successful, processing id_token");
            return this._validateIdTokenAttributes(state, response, response.id_token);
        }

        Log.debug("ResponseValidator._processCode: token response successful, returning response");
        return response;
    }

    protected async _validateIdTokenAttributes(state: SigninState, response: SigninResponse, id_token: string): Promise<SigninResponse> {
        const issuer = await this._metadataService.getIssuer();

        const audience = state.client_id;
        const clockSkewInSeconds = this._settings.clockSkewInSeconds;
        Log.debug("ResponseValidator._validateIdTokenAttributes: Validaing JWT attributes; using clock skew (in seconds) of: ", clockSkewInSeconds);

        const now = Timer.getEpochTime();
        const payload = JoseUtil.validateJwtAttributes(id_token, issuer, audience, clockSkewInSeconds, now);
        if (state.nonce && state.nonce !== payload.nonce) {
            Log.error("ResponseValidator._validateIdTokenAttributes: Invalid nonce in id_token");
            throw new Error("Invalid nonce in id_token");
        }

        if (!payload.sub) {
            Log.error("ResponseValidator._validateIdTokenAttributes: No sub present in id_token");
            throw new Error("No sub present in id_token");
        }

        response.profile = payload;
        return response;
    }

    protected async _getSigningKeyForJwt(jwt: any): Promise<Record<string, string> | null> {
        let keys = await this._metadataService.getSigningKeys();
        if (!keys) {
            Log.error("ResponseValidator._getSigningKeyForJwt: No signing keys from metadata");
            throw new Error("No signing keys from metadata");
        }

        Log.debug("ResponseValidator._getSigningKeyForJwt: Received signing keys");
        const kid = jwt.header.kid;
        if (kid) {
            const key = keys.filter(key => key.kid === kid)[0] ?? null;
            return key;
        }

        keys = this._filterByAlg(keys, jwt.header.alg);
        if (keys.length !== 1) {
            Log.error("ResponseValidator._getSigningKeyForJwt: No kid found in id_token and more than one key found in metadata");
            return null;
        }

        // kid is mandatory only when there are multiple keys in the referenced JWK Set document
        // see http://openid.net/specs/openid-connect-core-1_0.html#Signing
        return keys[0];
    }

    protected async _getSigningKeyForJwtWithSingleRetry(jwt: any): Promise<Record<string, string> | null> {
        const key = await this._getSigningKeyForJwt(jwt);
        if (key) {
            return key;
        }

        // Refreshing signingKeys if no suitable verification key is present for given jwt header.
        // set to undefined, to trigger network call to jwks_uri.
        this._metadataService.resetSigningKeys();
        return this._getSigningKeyForJwt(jwt);
    }

    protected async _validateIdToken(state: SigninState, response: SigninResponse, id_token: string): Promise<SigninResponse> {
        if (!state.nonce) {
            Log.error("ResponseValidator._validateIdToken: No nonce on state");
            throw new Error("No nonce on state");
        }

        const jwt = JoseUtil.parseJwt(id_token);
        if (!jwt || !jwt.header || !jwt.payload) {
            Log.error("ResponseValidator._validateIdToken: Failed to parse id_token", jwt);
            throw new Error("Failed to parse id_token");
        }

        const payload = jwt.payload;
        if (state.nonce !== payload.nonce) {
            Log.error("ResponseValidator._validateIdToken: Invalid nonce in id_token");
            throw new Error("Invalid nonce in id_token");
        }

        const issuer = await this._metadataService.getIssuer();
        Log.debug("ResponseValidator._validateIdToken: Received issuer");
        const key = await this._getSigningKeyForJwtWithSingleRetry(jwt);
        if (!key) {
            Log.error("ResponseValidator._validateIdToken: No key matching kid or alg found in signing keys");
            throw new Error("No key matching kid or alg found in signing keys");
        }

        const audience = state.client_id;
        const clockSkewInSeconds = this._settings.clockSkewInSeconds;
        Log.debug("ResponseValidator._validateIdToken: Validating JWT; using clock skew (in seconds) of: ", clockSkewInSeconds);

        JoseUtil.validateJwt(id_token, key, issuer, audience, clockSkewInSeconds);
        Log.debug("ResponseValidator._validateIdToken: JWT validation successful");

        if (!payload.sub) {
            Log.error("ResponseValidator._validateIdToken: No sub present in id_token");
            throw new Error("No sub present in id_token");
        }

        response.profile = payload;
        return response;
    }

    protected _filterByAlg(keys: Record<string, string>[], alg: string): Record<string, string>[] {
        let kty: string | null = null;
        if (alg.startsWith("RS")) {
            kty = "RSA";
        }
        else if (alg.startsWith("PS")) {
            kty = "PS";
        }
        else if (alg.startsWith("ES")) {
            kty = "EC";
        }
        else {
            Log.debug("ResponseValidator._filterByAlg: alg not supported: ", alg);
            return [];
        }

        Log.debug("ResponseValidator._filterByAlg: Looking for keys that match kty: ", kty);

        keys = keys.filter(key => {
            return key.kty === kty;
        });

        Log.debug("ResponseValidator._filterByAlg: Number of keys that match kty: ", kty, keys.length);

        return keys;
    }

    protected _validateAccessToken(response: SigninResponse, access_token: string): SigninResponse {
        if (!response.profile) {
            Log.error("ResponseValidator._validateAccessToken: No profile loaded from id_token");
            throw new Error("No profile loaded from id_token");
        }

        if (!response.profile.at_hash) {
            Log.error("ResponseValidator._validateAccessToken: No at_hash in id_token");
            throw new Error("No at_hash in id_token");
        }

        if (!response.id_token) {
            Log.error("ResponseValidator._validateAccessToken: No id_token");
            throw new Error("No id_token");
        }

        const jwt = JoseUtil.parseJwt(response.id_token);
        if (!jwt || !jwt.header) {
            Log.error("ResponseValidator._validateAccessToken: Failed to parse id_token", jwt);
            throw new Error("Failed to parse id_token");
        }

        const hashAlg = jwt.header.alg;
        if (!hashAlg || hashAlg.length !== 5) {
            Log.error("ResponseValidator._validateAccessToken: Unsupported alg:", hashAlg);
            throw new Error("Unsupported alg: " + String(hashAlg));
        }

        const hashBitsString = hashAlg.substr(2, 3);
        if (!hashBitsString) {
            Log.error("ResponseValidator._validateAccessToken: Unsupported alg:", hashAlg, hashBitsString);
            throw new Error("Unsupported alg: " + String(hashAlg));
        }

        const hashBits = parseInt(hashBitsString);
        if (hashBits !== 256 && hashBits !== 384 && hashBits !== 512) {
            Log.error("ResponseValidator._validateAccessToken: Unsupported alg:", hashAlg, hashBits);
            throw new Error("Unsupported alg: " + String(hashAlg));
        }

        const sha = "sha" + hashBits.toString();
        const hash = JoseUtil.hashString(access_token, sha);
        if (!hash) {
            Log.error("ResponseValidator._validateAccessToken: access_token hash failed:", sha);
            throw new Error("Failed to validate at_hash");
        }

        const left = hash.substr(0, hash.length / 2);
        const left_b64u = JoseUtil.hexToBase64Url(left);
        if (left_b64u !== response.profile.at_hash) {
            Log.error("ResponseValidator._validateAccessToken: Failed to validate at_hash", left_b64u, response.profile.at_hash);
            throw new Error("Failed to validate at_hash");
        }

        Log.debug("ResponseValidator._validateAccessToken: success");
        return response;
    }
}
