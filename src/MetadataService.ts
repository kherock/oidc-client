// Copyright (c) Brock Allen & Dominick Baier. All rights reserved.
// Licensed under the Apache License, Version 2.0. See LICENSE in the project root for license information.

import { Log } from "./utils";
import { JsonService } from "./JsonService";
import type { OidcClientSettingsStore, SigningKey } from "./OidcClientSettings";
import type { OidcMetadata } from "./OidcMetadata";

const OidcMetadataUrlPath = ".well-known/openid-configuration";

/**
 * @public
 */
export class MetadataService {
    private readonly _settings: OidcClientSettingsStore
    private readonly _jsonService: JsonService

    // cache
    private _metadataUrl: string | null;
    private _signingKeys: SigningKey[] | null;
    private _metadata: Partial<OidcMetadata> | null;

    public constructor(settings: OidcClientSettingsStore) {
        this._settings = settings;
        this._jsonService = new JsonService(["application/jwk-set+json"]);

        this._metadataUrl = null;
        if (this._settings.metadataUrl) {
            this._metadataUrl = this._settings.metadataUrl;
        } else if (this._settings.authority) {
            this._metadataUrl = this._settings.authority;
            if (this._metadataUrl[this._metadataUrl.length - 1] !== "/") {
                this._metadataUrl += "/";
            }
            this._metadataUrl += OidcMetadataUrlPath;
        }

        this._signingKeys = null;
        if (this._settings.signingKeys) {
            Log.debug("MetadataService.ctor: Using signingKeys from settings");
            this._signingKeys = this._settings.signingKeys;
        }

        this._metadata = null;
        if (this._settings.metadata) {
            Log.debug("MetadataService.ctor: Using metadata from settings");
            this._metadata = this._settings.metadata;
        }
    }

    public resetSigningKeys(): void {
        this._signingKeys = null;
    }

    public async getMetadata(): Promise<Partial<OidcMetadata>> {
        if (this._metadata) {
            Log.debug("MetadataService.getMetadata: Returning metadata from cache");
            return this._metadata;
        }

        if (!this._metadataUrl) {
            Log.error("MetadataService.getMetadata: No authority or metadataUrl configured on settings");
            throw new Error("No authority or metadataUrl configured on settings");
        }

        Log.debug("MetadataService.getMetadata: getting metadata from", this._metadataUrl);
        const metadata = await this._jsonService.getJson(this._metadataUrl);

        Log.debug("MetadataService.getMetadata: json received");
        const seed = this._settings.metadataSeed || {};
        this._metadata = Object.assign({}, seed, metadata) as Partial<OidcMetadata>;
        return this._metadata;
    }

    public getIssuer(): Promise<string> {
        return this._getMetadataProperty("issuer") as Promise<string>;
    }

    public getAuthorizationEndpoint(): Promise<string> {
        return this._getMetadataProperty("authorization_endpoint") as Promise<string>;
    }

    public getUserInfoEndpoint(): Promise<string> {
        return this._getMetadataProperty("userinfo_endpoint") as Promise<string>;
    }

    public getTokenEndpoint(optional=true): Promise<string | undefined> {
        return this._getMetadataProperty("token_endpoint", optional) as Promise<string | undefined>;
    }

    public getCheckSessionIframe(): Promise<string | undefined> {
        return this._getMetadataProperty("check_session_iframe", true) as Promise<string | undefined>;
    }

    public getEndSessionEndpoint(): Promise<string | undefined> {
        return this._getMetadataProperty("end_session_endpoint", true) as Promise<string | undefined>;
    }

    public getRevocationEndpoint(): Promise<string | undefined> {
        return this._getMetadataProperty("revocation_endpoint", true) as Promise<string | undefined>;
    }

    public getKeysEndpoint(optional=true): Promise<string | undefined> {
        return this._getMetadataProperty("jwks_uri", optional) as Promise<string | undefined>;
    }

    protected async _getMetadataProperty(name: keyof OidcMetadata, optional=false): Promise<string | boolean | string[] | undefined> {
        Log.debug("MetadataService.getMetadataProperty for: " + name);

        const metadata = await this.getMetadata();
        Log.debug("MetadataService.getMetadataProperty: metadata recieved");

        if (metadata[name] === undefined) {
            if (optional === true) {
                Log.warn("MetadataService.getMetadataProperty: Metadata does not contain optional property " + name);
                return undefined;
            }

            Log.error("MetadataService.getMetadataProperty: Metadata does not contain property " + name);
            throw new Error("Metadata does not contain property " + name);
        }

        return metadata[name];
    }

    public async getSigningKeys(): Promise<SigningKey[] | null> {
        if (this._signingKeys) {
            Log.debug("MetadataService.getSigningKeys: Returning signingKeys from cache");
            return this._signingKeys;
        }

        const jwks_uri = await this.getKeysEndpoint(false) as string;
        Log.debug("MetadataService.getSigningKeys: jwks_uri received", jwks_uri);

        const keySet = await this._jsonService.getJson(jwks_uri);
        Log.debug("MetadataService.getSigningKeys: key set received", keySet);

        if (!keySet.keys) {
            Log.error("MetadataService.getSigningKeys: Missing keys on keyset");
            throw new Error("Missing keys on keyset");
        }

        this._signingKeys = keySet.keys;
        return this._signingKeys;
    }
}
