// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { OperationCanceledError } from "../Errors";
import { IProjectMetadata, IStep } from "./HandlerInterfaces";
import { SpecifyBootVersionStep } from "./SpecifyBootVersionStep";
import { specifyServiceUrl } from "./utils";

export class SpecifyServiceUrlStep implements IStep {
    public static getInstance(): SpecifyServiceUrlStep {
        return SpecifyServiceUrlStep.specifyServiceUrlStep;
    }

    private static readonly specifyServiceUrlStep: SpecifyServiceUrlStep = new SpecifyServiceUrlStep();

    public getNextStep(): IStep | undefined {
        return SpecifyBootVersionStep.getInstance();
    }

    public async execute(_: string, projectMetadata: IProjectMetadata): Promise<IStep | undefined> {
        projectMetadata.serviceUrl = await specifyServiceUrl(projectMetadata);
        if (projectMetadata.serviceUrl === undefined) {
            throw new OperationCanceledError("Service URL not specified.");
        }
        return this.getNextStep();
    }
}
