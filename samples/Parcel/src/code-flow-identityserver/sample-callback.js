import { Log, UserManager, settings } from "./sample-settings";

Log.logger = console;
Log.level = Log.DEBUG;

function log() {
    document.getElementById("out").innerText = "";

    Array.prototype.forEach.call(arguments, function(msg) {
        if (msg instanceof Error) {
            msg = "Error: " + msg.message;
        }
        else if (typeof msg !== "string") {
            msg = JSON.stringify(msg, null, 2);
        }
        document.getElementById("out").innerHTML += msg + "\r\n";
    });
}
new UserManager(settings).signinCallback().then(function(user) {
    log("signin response success", user);
}).catch(function(err) {
    log(err);
});
