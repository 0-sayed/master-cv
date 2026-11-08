import { beforeEach } from "vite-plus/test";
import { configureFontReader } from "./fonts";
import { readServerFont } from "./fonts.node";

beforeEach(() => configureFontReader(readServerFont));
