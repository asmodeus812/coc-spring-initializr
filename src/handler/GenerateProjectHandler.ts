// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { createWriteStream } from "fs";
import * as fse from "fs-extra";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { URL } from "url";
import * as yauzl from "yauzl";
import { OperationCanceledError } from "../Errors";
import { ProjectType } from "../model";
import { downloadFile } from "../Utils";
import { isDirectory, isNonEmptyDirectory } from "../Utils/fsHelper";
import { BaseHandler } from "./BaseHandler";
import { IDefaultProjectData, IProjectMetadata, IStep, ParentFolder } from "./HandlerInterfaces";
import { SpecifyArtifactIdStep } from "./SpecifyArtifactIdStep";
import { SpecifyGroupIdStep } from "./SpecifyGroupIdStep";
import { SpecifyPackageNameStep } from "./SpecifyPackageNameStep";
import { SpecifyServiceUrlStep } from "./SpecifyServiceUrlStep";
import { focusCurrentResource } from "../Utils/xml";

const OPEN_IN_NEW_WORKSPACE = "Open";
const CANCEL_OPEN_WORKSPACE = "Cancel";
const UNZIP_TIMEOUT_IN_MS = 2 * 60 * 1000;

export class GenerateProjectHandler extends BaseHandler {
    private readonly projectType: ProjectType;
    private readonly metadata: IProjectMetadata;
    private outputUri: coc.Uri | undefined;

    constructor(projectType: ProjectType, defaults?: IDefaultProjectData) {
        super();
        this.projectType = projectType;
        this.metadata = {
            pickSteps: [],
            defaults: defaults || {},
            parentFolder: coc.workspace.getConfiguration("spring.initializr").get<ParentFolder>("parentFolder")
        };
    }

    protected get failureMessage(): string {
        return "Failed to create a project.";
    }

    public async runSteps(operationId: string): Promise<void> {
        let step: IStep | undefined = SpecifyServiceUrlStep.getInstance();

        SpecifyArtifactIdStep.getInstance().resetDefaultInput();
        SpecifyGroupIdStep.getInstance().resetDefaultInput();
        SpecifyPackageNameStep.getInstance().resetDefaultInput();
        while (step !== undefined) {
            step = await step.execute(operationId, this.metadata);
        }

        // Step: Choose target folder
        this.outputUri = await specifyTargetFolder(this.metadata);
        if (this.outputUri === undefined) {
            throw new OperationCanceledError("Target folder not specified.");
        }

        // Step: Download & Unzip
        await downloadAndUnzip(this.downloadUrl, this.outputUri);

        // Open project either is the same workspace or new workspace
        const hasOpenFolder = coc.workspace.workspaceFolders !== undefined || coc.workspace.root !== undefined;

        // Don't prompt to open projectLocation if it's already a currently opened folder
        if (
            hasOpenFolder &&
            (coc.workspace.workspaceFolders.some((folder) => folder.uri === this.outputUri?.toString()) ||
                coc.workspace.root === this.outputUri?.toString())
        ) {
            return;
        }

        if ((await specifyOpenMethod(hasOpenFolder, this.outputUri)) === OPEN_IN_NEW_WORKSPACE) {
            await focusCurrentResource(this.outputUri);
        }
    }

    private get downloadUrl(): string {
        const params: string[] = [
            `type=${this.projectType}`,
            `language=${this.metadata.language}`,
            `javaVersion=${this.metadata.javaVersion}`,
            `groupId=${this.metadata.groupId}`,
            `artifactId=${this.metadata.artifactId}`,
            `packageName=${this.metadata.packageName}`,
            `name=${this.metadata.artifactId}`,
            `packaging=${this.metadata.packaging}`,
            `bootVersion=${this.metadata.bootVersion}`,
            `dependencies=${this.metadata.dependencies?.id}`
        ];

        const serviceUrl: string = this.metadata.serviceUrl as string;
        const targetUrl = new URL(serviceUrl);
        targetUrl.pathname = "/starter.zip";
        targetUrl.search = `?${params.join("&")}`;
        return targetUrl.toString();
    }
}

async function specifyTargetFolder(metadata: IProjectMetadata): Promise<coc.Uri | undefined> {
    const OPTION_CANCEL: string = "Cancel";
    const OPTION_CONTINUE: string = "Continue";
    const OPTION_CHOOSE_ANOTHER_FOLDER: string = "Choose another folder";
    const LABEL_CHOOSE_FOLDER: string = "Generate into this folder";
    const useArtifactId: boolean = metadata.parentFolder === ParentFolder.ARTIFACT_ID;

    if (!metadata.defaults.targetFolder) {
        const workspaceFolderPath: string = coc.workspace.workspaceFolders?.[0]?.uri;
        metadata.defaults.targetFolder = coc.Uri.parse(workspaceFolderPath).fsPath;
    }

    let outputUri: string = metadata.defaults.targetFolder;
    if (useArtifactId) {
        outputUri = path.join(`${outputUri}/${metadata.artifactId}`);
    }

    const MESSAGE_EXISTING_FOLDER: string = `A folder [${outputUri}] already exists in the selected folder.`;
    const MESSAGE_FOLDER_NOT_EMPTY: string = `The folder [${outputUri}] is not empty. Existing files with same names will be overwritten.`;
    const MESSAGE: string = useArtifactId ? MESSAGE_EXISTING_FOLDER : MESSAGE_FOLDER_NOT_EMPTY;

    // If not using Artifact Id as folder name, we assume any existing files with same names will be overwritten
    // So we check if the folder is not empty, to avoid deleting files without user's consent
    while (useArtifactId ? await isDirectory(outputUri) : await isNonEmptyDirectory(outputUri)) {
        const overrideChoice: string | undefined = await coc.window.showWarningMessage(
            MESSAGE,
            OPTION_CHOOSE_ANOTHER_FOLDER,
            OPTION_CONTINUE,
            OPTION_CANCEL
        );
        if (overrideChoice === OPTION_CANCEL) {
            return undefined;
        } else if (overrideChoice === OPTION_CHOOSE_ANOTHER_FOLDER) {
            const userInput: coc.Uri | undefined = await requireInputFolder(LABEL_CHOOSE_FOLDER, LABEL_CHOOSE_FOLDER, outputUri);
            if (userInput === undefined) {
                return undefined;
            }
            outputUri = userInput.fsPath;
        } else {
            break;
        }
    }
    await fse.ensureDir(outputUri);
    return coc.Uri.file(outputUri);
}

async function downloadAndUnzip(targetUrl: string, targetFolder: coc.Uri): Promise<void> {
    await coc.window.withProgress({ title: "Downloading & unzipping..." }, async (progress: coc.Progress<{ message?: string }>) => {
        let filepath: string;
        progress.report({ message: "Downloading project package..." });
        filepath = await downloadFile(targetUrl);
        progress.report({ message: "Unzipping project archive..." });
        await unzipWithTimeout(filepath, targetFolder.fsPath);
    });
}

interface IExtraction {
    aborted: boolean;
    zip?: yauzl.ZipFile;
    stream?: Readable;
}

// coc runs extensions without AbortController, the timeout closes the archive and the open entry stream instead
async function unzipWithTimeout(filepath: string, targetFolder: string): Promise<void> {
    const extraction: IExtraction = { aborted: false };
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject: (e: Error) => void) => {
        timer = setTimeout(() => {
            extraction.aborted = true;
            extraction.stream?.destroy();
            extraction.zip?.close();
            reject(new Error("Timed out while unzipping the generated project."));
        }, UNZIP_TIMEOUT_IN_MS);
    });
    try {
        await Promise.race([extractZip(filepath, targetFolder, extraction), timeout]);
    } finally {
        clearTimeout(timer);
    }
}

async function extractZip(filepath: string, targetFolder: string, extraction: IExtraction): Promise<void> {
    const zip: yauzl.ZipFile = await yauzl.openPromise(filepath, { strictFileNames: true, validateEntrySizes: true });
    const targetRoot: string = path.resolve(targetFolder);
    extraction.zip = zip;
    try {
        for await (const entry of zip.eachEntry()) {
            if (extraction.aborted) {
                throw new Error("Zip extraction aborted.");
            }
            const targetPath: string = path.resolve(targetRoot, entry.fileName);
            if (targetPath !== targetRoot && !targetPath.startsWith(`${targetRoot}${path.sep}`)) {
                throw new Error(`Invalid zip entry path: ${entry.fileName}`);
            }

            if (entry.fileName.endsWith("/")) {
                await fse.ensureDir(targetPath);
            } else {
                await fse.ensureDir(path.dirname(targetPath));
                extraction.stream = await zip.openReadStreamPromise(entry);
                await pipeline(extraction.stream, createWriteStream(targetPath));
                const mode: number = (entry.externalFileAttributes >>> 16) & 0xffff;
                if (mode !== 0) {
                    await fse.chmod(targetPath, mode);
                }
            }
        }
    } finally {
        zip.close();
    }
}

async function specifyOpenMethod(hasOpenFolder: boolean, projectLocation: coc.Uri): Promise<string> {
    let openMethod = coc.workspace.getConfiguration("spring.initializr").get<string>("defaultOpenProjectMethod", OPEN_IN_NEW_WORKSPACE);
    if (openMethod !== CANCEL_OPEN_WORKSPACE && openMethod !== OPEN_IN_NEW_WORKSPACE) {
        let candidates: string[] = [OPEN_IN_NEW_WORKSPACE, hasOpenFolder ? CANCEL_OPEN_WORKSPACE : undefined].filter(
            (c) => c !== undefined
        );
        const result = await coc.window.showQuickPick(candidates, {
            placeholder: `Generated at location: ${projectLocation.fsPath}`
        });
        if (result !== undefined) {
            openMethod = result;
        } else {
            return CANCEL_OPEN_WORKSPACE;
        }
    }
    return openMethod;
}

async function requireInputFolder(title: string, prompt: string, _default: string): Promise<coc.Uri | undefined> {
    const input: string | undefined = await coc.window.requestInput(title, _default, {
        placeholder: prompt
    });

    if (input === undefined) {
        return;
    }
    return coc.Uri.file(input);
}
