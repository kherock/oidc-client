// Copyright (c) Brock Allen & Dominick Baier. All rights reserved.
// Licensed under the Apache License, Version 2.0. See LICENSE in the project root for license information.

import { Log } from "./Log";
import { Event } from "./Event";

const DefaultTimerDurationInSeconds = 5; // seconds

export type IntervalTimer = {
    setInterval: (cb: (...args: any[]) => void, duration?: number | undefined) => number;
    clearInterval: (handle: number) => void;
};
export const g_timer: IntervalTimer = {
    setInterval: function (cb: (...args: any[]) => void, duration?: number): number {
        return window.setInterval(cb, duration);
    },
    clearInterval: function (handle: number): void {
        return window.clearInterval(handle);
    }
};

export class Timer extends Event {
    private _timer = g_timer;
    private _timerHandle: number | null = null;
    private _expiration = 0;

    // get the time
    public static getEpochTime(): number {
        return Math.floor(Date.now() / 1000);
    }

    public init(durationInSeconds: number): void {
        if (durationInSeconds <= 0) {
            durationInSeconds = 1;
        }

        durationInSeconds = Math.floor(durationInSeconds);
        const expiration = Timer.getEpochTime() + durationInSeconds;
        if (this.expiration === expiration && this._timerHandle) {
            // no need to reinitialize to same expiration, so bail out
            Log.debug("Timer.init timer " + this._name + " skipping initialization since already initialized for expiration:", this.expiration);
            return;
        }

        this.cancel();

        Log.debug("Timer.init timer " + this._name + " for duration:", durationInSeconds);
        this._expiration = expiration;

        // we're using a fairly short timer and then checking the expiration in the
        // callback to handle scenarios where the browser device sleeps, and then
        // the timers end up getting delayed.
        let timerDurationInSeconds = DefaultTimerDurationInSeconds;
        if (durationInSeconds < timerDurationInSeconds) {
            timerDurationInSeconds = durationInSeconds;
        }
        this._timerHandle = this._timer.setInterval(this._callback, timerDurationInSeconds * 1000);
    }

    public get expiration(): number {
        return this._expiration;
    }

    public cancel(): void {
        if (this._timerHandle) {
            Log.debug("Timer.cancel: ", this._name);
            this._timer.clearInterval(this._timerHandle);
            this._timerHandle = null;
        }
    }

    protected _callback = (): void => {
        const diff = this._expiration - Timer.getEpochTime();
        Log.debug("Timer.callback; " + this._name + " timer expires in:", diff);

        if (this._expiration <= Timer.getEpochTime()) {
            this.cancel();
            super.raise();
        }
    }
}
