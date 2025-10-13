// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { workspace } from "coc.nvim";
import { IInputMetaData, IProjectMetadata, IStep } from "./HandlerInterfaces";
import { SpecifyPackageNameStep } from "./SpecifyPackageNameStep";
import { createInputBox } from "./utils";

export class SpecifyArtifactIdStep implements IStep {
    public static getInstance(): SpecifyArtifactIdStep {
        return SpecifyArtifactIdStep.specifyArtifactIdStep;
    }

    private static readonly specifyArtifactIdStep: SpecifyArtifactIdStep = new SpecifyArtifactIdStep();

    private defaultInput: string | undefined;

    constructor() {
        this.resetDefaultInput();
    }

    public getDefaultInput(): string | undefined {
        return this.defaultInput;
    }

    public setDefaultInput(defaultInput: string): void {
        this.defaultInput = defaultInput;
    }

    public resetDefaultInput(): void {
        this.defaultInput = workspace.getConfiguration("spring.initializr").get<string>("defaultArtifactId");
    }

    public getNextStep(): IStep | undefined {
        return SpecifyPackageNameStep.getInstance();
    }

    public async execute(operationId: string, projectMetadata: IProjectMetadata): Promise<IStep | undefined> {
        if (!(await this.specifyArtifactId(projectMetadata))) {
            return projectMetadata.pickSteps.pop();
        }
        return this.getNextStep();
    }

    private async specifyArtifactId(projectMetadata: IProjectMetadata): Promise<boolean> {
        const inputMetaData: IInputMetaData = {
            metadata: projectMetadata,
            title: "Spring Initializr: Input Artifact Id",
            pickStep: SpecifyArtifactIdStep.getInstance(),
            placeholder: "e.g. demo",
            prompt: "Input Artifact Id for your project.",
            defaultValue: projectMetadata.defaults.artifactId || SpecifyArtifactIdStep.getInstance().defaultInput || ""
        };
        return await createInputBox(inputMetaData);
    }
}
