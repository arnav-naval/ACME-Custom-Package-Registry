"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.info = info;
exports.debug = debug;
exports.silent = silent;
const fs = __importStar(require("fs/promises"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables from .env file
dotenv_1.default.config();
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
function info(message) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureLogFileExists();
        yield log(message, LogLevel.INFO);
    });
}
function debug(message) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureLogFileExists();
        yield log(message, LogLevel.DEBUG);
    });
}
function silent(message) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureLogFileExists();
        yield log(message, LogLevel.SILENT);
    });
}
//# sourceMappingURL=logger.js.map