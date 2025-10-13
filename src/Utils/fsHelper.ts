// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri } from "coc.nvim";
import * as fse from "fs-extra";

export async function isDirectory(uri: Uri): Promise<boolean | undefined> {
    try {
        return (await fse.stat(uri.fsPath)).isDirectory();
    } catch (error) {
        return false;
    }
}

export async function isFile(uri: Uri): Promise<boolean | undefined> {
    try {
        return (await fse.stat(uri.fsPath)).isFile();
    } catch (error) {
        return false;
    }
}

export async function pathExists(uri: Uri): Promise<boolean> {
    try {
        await fse.exists(uri.fsPath);
        return true;
    } catch (error) {
        return false;
    }
}
