// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import * as extract from "extract-zip";
import { URL } from "url";
import { OperationCanceledError } from "../Errors";
import { ProjectType } from "../model";
import { downloadFile } from "../Utils";
import { isDirectory, pathExists } from "../Utils/fsHelper";
import { BaseHandler } from "./BaseHandler";
import { IDefaultProjectData, IProjectMetadata, IStep, ParentFolder } from "./HandlerInterfaces";
import { SpecifyArtifactIdStep } from "./SpecifyArtifactIdStep";
import { SpecifyGroupIdStep } from "./SpecifyGroupIdStep";
import { SpecifyPackageNameStep } from "./SpecifyPackageNameStep";
import { SpecifyServiceUrlStep } from "./SpecifyServiceUrlStep";

const OPEN_IN_NEW_WORKSPACE = "Open";
const CANCEL_OPEN_WORKSPACE = "Cancel";

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
            (coc.workspace.workspaceFolders.some((folder) => folder.uri === this.outputUri?.fsPath) ||
                coc.workspace.root === this.outputUri.fsPath)
        ) {
            return;
        }

        if ((await specifyOpenMethod(hasOpenFolder, this.outputUri)) === OPEN_IN_NEW_WORKSPACE) {
            coc.commands.executeCommand("vscode.open", this.outputUri.fsPath);
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
    const OPTION_CONTINUE: string = "Continue";
    const OPTION_CHOOSE_ANOTHER_FOLDER: string = "Choose another folder";
    const LABEL_CHOOSE_FOLDER: string = "Generate into this folder";
    const useArtifactId: boolean = metadata.parentFolder === ParentFolder.ARTIFACT_ID;

    let outputUri: coc.Uri | undefined = metadata.defaults.targetFolder
        ? coc.Uri.file(metadata.defaults.targetFolder)
        : await requireInputFolder(LABEL_CHOOSE_FOLDER, LABEL_CHOOSE_FOLDER);

    if (outputUri && useArtifactId) {
        outputUri = coc.Uri.file(`${outputUri.fsPath}/${metadata.artifactId}`);
    }

    const MESSAGE_EXISTING_FOLDER: string = `A folder [${outputUri?.fsPath}] already exists in the selected folder.`;
    const MESSAGE_FOLDER_NOT_EMPTY: string = `The folder [${outputUri?.fsPath}] is not empty. Existing files with same names will be overwritten.`;
    const MESSAGE: string = useArtifactId ? MESSAGE_EXISTING_FOLDER : MESSAGE_FOLDER_NOT_EMPTY;

    // If not using Artifact Id as folder name, we assume any existing files with same names will be overwritten
    // So we check if the folder is not empty, to avoid deleting files without user's consent
    while (
        (!useArtifactId && outputUri && (await isDirectory(outputUri))) ||
        (useArtifactId && outputUri && (await pathExists(outputUri)))
    ) {
        const overrideChoice: string | undefined = await coc.window.showWarningMessage(
            MESSAGE,
            OPTION_CONTINUE,
            OPTION_CHOOSE_ANOTHER_FOLDER
        );
        if (overrideChoice === OPTION_CHOOSE_ANOTHER_FOLDER) {
            outputUri = await requireInputFolder(LABEL_CHOOSE_FOLDER, LABEL_CHOOSE_FOLDER);
        } else {
            break;
        }
    }
    return outputUri;
}

async function downloadAndUnzip(targetUrl: string, targetFolder: coc.Uri): Promise<void> {
    await coc.window.withProgress(
        { title: "Downloading & unzipping" },
        (progress: coc.Progress<{ message?: string }>) =>
            new Promise<void>(async (resolve: () => void, reject: (e: Error) => void): Promise<void> => {
                let filepath: string;
                try {
                    progress.report({ message: "Downloading project package..." });
                    filepath = await downloadFile(targetUrl);
                } catch (error: any) {
                    coc.window.showErrorMessage("Unable to download project archive");
                    return reject(error);
                }

                progress.report({ message: "Unzipping project archive..." });
                await extract
                    .default(filepath, { dir: targetFolder.fsPath })
                    .then(() => {
                        return resolve();
                    })
                    .catch((err) => {
                        if (err) {
                            coc.window.showErrorMessage("Unable to extract resources");
                            return reject(err);
                        }
                        return resolve();
                    });
            })
    );
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

async function requireInputFolder(title: string, prompt: string): Promise<coc.Uri | undefined> {
    const input: string | undefined = await coc.window.requestInput(
        title,
        coc.workspace.workspaceFolders && coc.workspace.workspaceFolders.length > 0 ? coc.workspace.workspaceFolders[0].uri : undefined,
        {
            placeholder: prompt
        }
    );

    if (input === undefined) {
        return;
    }
    return coc.Uri.parse(input);
}
