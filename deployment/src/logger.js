var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as fs from "fs/promises";
import dotenv from "dotenv";
// Load environment variables from .env file
dotenv.config();
// Define log levels
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["SILENT"] = 0] = "SILENT";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 2] = "DEBUG";
})(LogLevel || (LogLevel = {}));
// Get log file path and log level from environment variables, with defaults
const logFile = process.env.LOG_FILE || process.exit(1);
const logLevel = parseInt(process.env.LOG_LEVEL || "0", 10);
// Ensure log file exists (optional, can remove if not necessary)
function ensureLogFileExists() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield fs.access(logFile);
        }
        catch (_a) {
            yield fs.writeFile(logFile, "", "utf8");
        }
    });
}
// Utility function to log messages
function log(message, level) {
    return __awaiter(this, void 0, void 0, function* () {
        if (level <= logLevel) {
            const logMessage = `[${new Date().toISOString()}] ${LogLevel[level]}: ${message}\n`;
            yield fs.appendFile(logFile, logMessage, "utf8");
        }
    });
}
// Specific log level functions
export function info(message) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureLogFileExists();
        yield log(message, LogLevel.INFO);
    });
}
export function debug(message) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureLogFileExists();
        yield log(message, LogLevel.DEBUG);
    });
}
export function silent(message) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureLogFileExists();
        yield log(message, LogLevel.SILENT);
    });
}
//# sourceMappingURL=logger.js.map