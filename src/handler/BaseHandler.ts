// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { OperationCanceledError } from "../Errors";

export abstract class BaseHandler {
    protected abstract failureMessage: string;

    public async run(operationId?: string, ...args: any[]): Promise<void> {
        try {
            await this.runSteps(operationId, ...args);
        } catch (error: any) {
            // a canceled wizard (<Esc>, <C-c> or an empty answer) ends quietly
            if (!(error instanceof OperationCanceledError)) {
                coc.window.showErrorMessage(`${this.failureMessage} ${error.message}`);
                throw error;
            }
        }
    }

    protected abstract runSteps(operationId?: string, ...args: any[]): Promise<void>;
}
