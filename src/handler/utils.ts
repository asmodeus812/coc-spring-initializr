// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { window } from "coc.nvim";
import { OperationCanceledError } from "../Errors";
import { Identifiable } from "../model/Metadata";
import { IHandlerItem, IInputMetaData, IPickMetadata, IProjectMetadata } from "./HandlerInterfaces";
import { SpecifyArtifactIdStep } from "./SpecifyArtifactIdStep";
import { SpecifyBootVersionStep } from "./SpecifyBootVersionStep";
import { SpecifyGroupIdStep } from "./SpecifyGroupIdStep";
import { SpecifyJavaVersionStep } from "./SpecifyJavaVersionStep";
import { SpecifyLanguageStep } from "./SpecifyLanguageStep";
import { SpecifyPackageNameStep } from "./SpecifyPackageNameStep";
import { SpecifyPackagingStep } from "./SpecifyPackagingStep";
import { SpecifyServiceUrlStep } from "./SpecifyServiceUrlStep";

const DEFAULT_SERVICE_URL: string = "https://start.spring.io";
const INPUT_CANCELED: string = "<coc-spring-initializr:canceled>";

// ask for a line of text; undefined when the user cancels: <Esc>, <C-c> (coc rejects with "Keyboard interrupt")
// or an empty answer. With coc.preferences.promptInput off coc reads the text with the cmdline input(), where <Esc>
// returns the typed text, so on Neovim the prompt is shown here with a cancelreturn that <Esc> yields instead
export async function readInput(title: string, value: string | undefined, placeholder?: string): Promise<string | undefined> {
    let input: string | null | undefined;
    try {
        const promptInput: boolean = coc.workspace.getConfiguration("coc.preferences").get<boolean>("promptInput", true);
        if (coc.workspace.isNvim && !(promptInput && coc.workspace.env.dialog)) {
            input = (await coc.workspace.nvim.call("input", [{ prompt: `${title}: `, default: value ?? "", cancelreturn: INPUT_CANCELED }])) as string;
            coc.workspace.nvim.command("normal! :<C-u>", true);
        } else {
            input = await window.requestInput(title, value, { placeholder });
        }
    } catch (error: any) {
        if (/Keyboard interrupt/i.test(String(error?.message ?? error))) {
            input = undefined;
        } else {
            throw error;
        }
    }
    let result: string | undefined;
    if (typeof input === "string" && input !== INPUT_CANCELED && input.trim() !== "") {
        result = input;
    }
    return result;
}

export async function specifyServiceUrl(projectMetadata?: IProjectMetadata): Promise<string | undefined> {
    const configValue: string | string[] = coc.workspace.getConfiguration("spring.initializr").get<string | string[]>("serviceUrl", []);
    if (typeof configValue === "string") {
        return configValue;
    } else if (typeof configValue === "object" && configValue instanceof Array && configValue.length > 0) {
        if (configValue.length === 1) {
            return configValue[0];
        }
        if (projectMetadata !== undefined) {
            projectMetadata.pickSteps.push(SpecifyServiceUrlStep.getInstance());
        }
        return await coc.window.showQuickPick(configValue, { placeholder: "Select the service URL." });
    } else {
        return DEFAULT_SERVICE_URL;
    }
}

export async function createPickBox<T extends Identifiable>(pickMetadata: IPickMetadata<T>): Promise<boolean> {
    const selected = await window.showQuickPick<IHandlerItem<T>>(pickMetadata.items, {
        title: pickMetadata.title,
        placeholder: pickMetadata.placeholder
    });

    if (selected === undefined) {
        if (pickMetadata.pickStep instanceof SpecifyLanguageStep) {
            throw new OperationCanceledError("Language not specified.");
        } else if (pickMetadata.pickStep instanceof SpecifyJavaVersionStep) {
            throw new OperationCanceledError("Java version not specified.");
        } else if (pickMetadata.pickStep instanceof SpecifyPackagingStep) {
            throw new OperationCanceledError("Packaging not specified.");
        } else if (pickMetadata.pickStep instanceof SpecifyBootVersionStep) {
            throw new OperationCanceledError("BootVersion not specified.");
        }
        throw new OperationCanceledError("Selection not specified.");
    } else {
        if (pickMetadata.pickStep instanceof SpecifyLanguageStep) {
            pickMetadata.metadata.language = selected.label?.toLowerCase();
        } else if (pickMetadata.pickStep instanceof SpecifyJavaVersionStep) {
            pickMetadata.metadata.javaVersion = selected.value?.id;
        } else if (pickMetadata.pickStep instanceof SpecifyPackagingStep) {
            pickMetadata.metadata.packaging = selected.label?.toLowerCase();
        } else if (pickMetadata.pickStep instanceof SpecifyBootVersionStep) {
            pickMetadata.metadata.bootVersion = selected.value?.id;
        }
        pickMetadata.metadata.pickSteps.push(pickMetadata.pickStep);
        return true;
    }
}

export async function createInputBox(inputMetaData: IInputMetaData): Promise<boolean> {
    const input: string | undefined = await readInput(inputMetaData.prompt, inputMetaData.defaultValue, inputMetaData.placeholder);

    if (input === undefined) {
        if (inputMetaData.pickStep instanceof SpecifyGroupIdStep) {
            throw new OperationCanceledError("GroupId not specified.");
        } else if (inputMetaData.pickStep instanceof SpecifyArtifactIdStep) {
            throw new OperationCanceledError("ArtifactId not specified.");
        } else if (inputMetaData.pickStep instanceof SpecifyPackageNameStep) {
            throw new OperationCanceledError("PackageName not specified.");
        }
        throw new OperationCanceledError("Input not specified.");
    }

    if (inputMetaData.pickStep instanceof SpecifyGroupIdStep) {
        inputMetaData.metadata.groupId = input;
        SpecifyGroupIdStep.getInstance().setDefaultInput(input);
        inputMetaData.metadata.pickSteps.push(SpecifyGroupIdStep.getInstance());
    } else if (inputMetaData.pickStep instanceof SpecifyArtifactIdStep) {
        inputMetaData.metadata.artifactId = input;
        SpecifyArtifactIdStep.getInstance().setDefaultInput(input);
        inputMetaData.metadata.pickSteps.push(SpecifyArtifactIdStep.getInstance());
    } else if (inputMetaData.pickStep instanceof SpecifyPackageNameStep) {
        inputMetaData.metadata.packageName = input;
        SpecifyPackageNameStep.getInstance().setDefaultInput(input);
        inputMetaData.metadata.pickSteps.push(SpecifyPackageNameStep.getInstance());
    }
    return true;
}
