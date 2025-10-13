// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { workspace } from "coc.nvim";
import { serviceManager } from "../model";
import { MatadataType, Packaging } from "../model/Metadata";
import { IPickMetadata, IProjectMetadata, IStep } from "./HandlerInterfaces";
import { SpecifyJavaVersionStep } from "./SpecifyJavaVersionStep";
import { createPickBox } from "./utils";

export class SpecifyPackagingStep implements IStep {
    public static getInstance(): SpecifyPackagingStep {
        return SpecifyPackagingStep.specifyPackagingStep;
    }

    private static readonly specifyPackagingStep: SpecifyPackagingStep = new SpecifyPackagingStep();

    public getNextStep(): IStep | undefined {
        return SpecifyJavaVersionStep.getInstance();
    }

    public async execute(_: string, projectMetadata: IProjectMetadata): Promise<IStep | undefined> {
        if (!(await this.specifyPackaging(projectMetadata))) {
            return projectMetadata.pickSteps.pop();
        }
        return this.getNextStep();
    }

    private async specifyPackaging(projectMetadata: IProjectMetadata): Promise<boolean> {
        const packaging: string | undefined =
            projectMetadata.defaults.packaging || workspace.getConfiguration("spring.initializr").get<string>("defaultPackaging");
        if (packaging) {
            projectMetadata.packaging = packaging?.toLowerCase();
            return true;
        }
        const pickMetaData: IPickMetadata<Packaging> = {
            metadata: projectMetadata,
            title: "Spring Initializr: Specify packaging type",
            pickStep: SpecifyPackagingStep.getInstance(),
            placeholder: "Specify packaging type.",
            items: projectMetadata.serviceUrl ? serviceManager.getItems(projectMetadata.serviceUrl, MatadataType.PACKAGING) : []
        };
        return await createPickBox(pickMetaData);
    }
}
