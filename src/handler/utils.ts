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
        return false;
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
    const input: string | undefined = await window.requestInput(inputMetaData.prompt, inputMetaData.defaultValue, {
        placeholder: inputMetaData.placeholder
    });

    if (input === undefined) {
        if (inputMetaData.pickStep instanceof SpecifyGroupIdStep) {
            throw new OperationCanceledError("GroupId not specified.");
        } else if (inputMetaData.pickStep instanceof SpecifyArtifactIdStep) {
            throw new OperationCanceledError("ArtifactId not specified.");
        } else if (inputMetaData.pickStep instanceof SpecifyPackageNameStep) {
            throw new OperationCanceledError("PackageName not specified.");
        }
        return false;
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
