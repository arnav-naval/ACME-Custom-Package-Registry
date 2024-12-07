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
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const ms = __importStar(require("./metric_score.js"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const logger_js_1 = require("./logger.js");
//Function to process a URL and calculate its Netscore
function processUrl(url) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const startTime = Date.now();
            const score = yield ms.netScore(url);
            const netScoreLatency = Date.now() - startTime; // overall Netscore Latency
            yield (0, logger_js_1.info)(`Processed URL: ${url}, Score: ${score}`);
            let ret = {
                URL: url,
                NetScore: score.NetScore,
                RampUp: score.RampUp,
                Correctness: score.Correctness,
                BusFactor: score.BusFactor,
                ResponsiveMaintainer: score.ResponsiveMaintainer,
                License: score.License,
                PinnedDependencies: score.PinnedDependencies,
                PRReview: score.PRReview,
                NetScore_Latency: netScoreLatency,
                RampUp_Latency: score.RampUp_Latency,
                Correctness_Latency: score.Correctness_Latency,
                BusFactor_Latency: score.BusFactor_Latency,
                ResponsiveMaintainer_Latency: score.ResponsiveMaintainer_Latency,
                License_Latency: score.License_Latency,
                PinnedDependencies_Latency: score.PinnedDependencies_Latency,
                PRReview_Latency: score.PRReview_Latency,
            };
            return ret;
        }
        catch (err) {
            yield (0, logger_js_1.info)(`Error processing ${url}: ${err.message}`);
            return { URL: url, NetScore: -1 };
        }
    });
}
//Main function to process URLs from a file or command line arguments
function main(testFile) {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, logger_js_1.info)("Program started");
        // check if filename provided
        if (process.argv.length < 3 && !testFile) {
            yield (0, logger_js_1.info)("Usage: npm start <filename>");
            process.exit(1);
        }
        const filename = testFile ? testFile : process.argv[2];
        let ndjsonOutput;
        try {
            // read file content
            const filePath = path.resolve(filename);
            const fileContent = yield fs.readFile(filePath, "utf-8");
            // split file content by newline and filter empty lines
            const urls = fileContent.split("\n").filter((line) => line.trim() !== "");
            yield (0, logger_js_1.info)(`Processing ${urls.length} URLs from file: ${filename}`);
            // Process all URLs in parallel (concurrently)
            const results = yield Promise.all(urls.map((url) => processUrl(url)));
            // Prepare NDJSON output
            ndjsonOutput = results.map((result) => JSON.stringify(result)).join("\n");
            // print output to console
            console.log(ndjsonOutput);
        }
        catch (err) {
            yield (0, logger_js_1.info)(`Error reading file: ${filename}. Error: ${err.message}`);
            process.exit(1);
        }
        finally {
            if (testFile) {
                return ndjsonOutput;
            }
            else {
                yield (0, logger_js_1.info)("Program ended");
                process.exit(0);
            }
        }
    });
}
// Only call main if this file is being run directly outside of Jasmine
if (!process.argv[1].endsWith("jasmine.js") &&
    !process.argv[1].endsWith("jasmine")) {
    main();
}
//# sourceMappingURL=app.js.map