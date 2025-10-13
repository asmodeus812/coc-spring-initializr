// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { serviceManager } from "../model";
import { BootVersion, MatadataType } from "../model/Metadata";
import { IPickMetadata, IProjectMetadata, IStep } from "./HandlerInterfaces";
import { SpecifyLanguageStep } from "./SpecifyLanguageStep";
import { createPickBox } from "./utils";

export class SpecifyBootVersionStep implements IStep {
    public static getInstance(): SpecifyBootVersionStep {
        return SpecifyBootVersionStep.specifyBootVersionStep;
    }

    private static readonly specifyBootVersionStep: SpecifyBootVersionStep = new SpecifyBootVersionStep();

    public getNextStep(): IStep | undefined {
        return SpecifyLanguageStep.getInstance();
    }

    public async execute(_: string, projectMetadata: IProjectMetadata): Promise<IStep | undefined> {
        if (!(await this.specifyBootVersion(projectMetadata))) {
            return projectMetadata.pickSteps.pop();
        }
        return this.getNextStep();
    }

    private async specifyBootVersion(projectMetadata: IProjectMetadata): Promise<boolean> {
        const pickMetaData: IPickMetadata<BootVersion> = {
            metadata: projectMetadata,
            title: "Spring Initializr: Specify Spring Boot version",
            pickStep: SpecifyBootVersionStep.getInstance(),
            placeholder: "Specify Spring Boot version.",
            items: projectMetadata.serviceUrl ? serviceManager.getItems(projectMetadata.serviceUrl, MatadataType.BOOTVERSION) : []
        };
        return await createPickBox(pickMetaData);
    }
}
