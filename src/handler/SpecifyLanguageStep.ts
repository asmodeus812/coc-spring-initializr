// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { workspace } from "coc.nvim";
import { serviceManager } from "../model";
import { Language, MatadataType } from "../model/Metadata";
import { IPickMetadata, IProjectMetadata, IStep } from "./HandlerInterfaces";
import { SpecifyGroupIdStep } from "./SpecifyGroupIdStep";
import { createPickBox } from "./utils";

export class SpecifyLanguageStep implements IStep {
    public static getInstance(): SpecifyLanguageStep {
        return SpecifyLanguageStep.specifyLanguageStep;
    }

    private static readonly specifyLanguageStep: SpecifyLanguageStep = new SpecifyLanguageStep();

    public getNextStep(): IStep | undefined {
        return SpecifyGroupIdStep.getInstance();
    }

    public async execute(_: string, projectMetadata: IProjectMetadata): Promise<IStep | undefined> {
        if (!(await this.specifyLanguage(projectMetadata))) {
            return projectMetadata.pickSteps.pop();
        }
        return this.getNextStep();
    }

    private async specifyLanguage(projectMetadata: IProjectMetadata): Promise<boolean> {
        const language: string | undefined =
            projectMetadata.defaults.language || workspace.getConfiguration("spring.initializr").get<string>("defaultLanguage");
        if (language) {
            projectMetadata.language = language?.toLowerCase();
            return true;
        }
        const pickMetaData: IPickMetadata<Language> = {
            metadata: projectMetadata,
            title: "Spring Initializr: Specify project language",
            pickStep: SpecifyLanguageStep.getInstance(),
            placeholder: "Specify project language.",
            items: projectMetadata.serviceUrl ? serviceManager.getItems(projectMetadata.serviceUrl, MatadataType.LANGUAGE) : []
        };
        return await createPickBox(pickMetaData);
    }
}
