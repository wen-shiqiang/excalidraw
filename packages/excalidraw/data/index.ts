import { getRequest, postRequest } from "../requstUtil.js";
import {
  copyBlobToClipboardAsPng,
  copyTextToSystemClipboard,
} from "../clipboard";
import {
  DEFAULT_EXPORT_PADDING,
  DEFAULT_FILENAME,
  isFirefox,
  MIME_TYPES,
} from "../constants";
import { getNonDeletedElements } from "../element";
import { isFrameLikeElement } from "../element/typeChecks";
import {
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
  NonDeletedExcalidrawElement,
} from "../element/types";
import { t } from "../i18n";
import { isSomeElementSelected, getSelectedElements } from "../scene";
import { exportToCanvas, exportToSvg } from "../scene/export";
import { ExportType } from "../scene/types";
import { AppState, BinaryFiles } from "../types";
import { cloneJSON } from "../utils";
import { canvasToBlob } from "./blob";
import { fileSave, FileSystemHandle } from "./filesystem";
import { serializeAsJSON } from "./json";
import { getElementsOverlappingFrame } from "../frame";
export { loadFromBlob } from "./blob";
export { loadFromJSON, saveAsJSON } from "./json";

export type ExportedElements = readonly NonDeletedExcalidrawElement[] & {
  _brand: "exportedElements";
};

export const prepareElementsForExport = (
  elements: readonly ExcalidrawElement[],
  { selectedElementIds }: Pick<AppState, "selectedElementIds">,
  exportSelectionOnly: boolean,
) => {
  elements = getNonDeletedElements(elements);

  const isExportingSelection =
    exportSelectionOnly &&
    isSomeElementSelected(elements, { selectedElementIds });

  let exportingFrame: ExcalidrawFrameLikeElement | null = null;
  let exportedElements = isExportingSelection
    ? getSelectedElements(
        elements,
        { selectedElementIds },
        {
          includeBoundTextElement: true,
        },
      )
    : elements;

  if (isExportingSelection) {
    if (
      exportedElements.length === 1 &&
      isFrameLikeElement(exportedElements[0])
    ) {
      exportingFrame = exportedElements[0];
      exportedElements = getElementsOverlappingFrame(elements, exportingFrame);
    } else if (exportedElements.length > 1) {
      exportedElements = getSelectedElements(
        elements,
        { selectedElementIds },
        {
          includeBoundTextElement: true,
          includeElementsInFrames: true,
        },
      );
    }
  }

  return {
    exportingFrame,
    exportedElements: cloneJSON(exportedElements) as ExportedElements,
  };
};

export const exportCanvas = async (
  type: Omit<ExportType, "backend">,
  elements: ExportedElements,
  appState: AppState,
  files: BinaryFiles,
  {
    exportBackground,
    exportPadding = DEFAULT_EXPORT_PADDING,
    viewBackgroundColor,
    name = appState.name || DEFAULT_FILENAME,
    fileHandle = null,
    exportingFrame = null,
  }: {
    exportBackground: boolean;
    exportPadding?: number;
    viewBackgroundColor: string;
    /** filename, if applicable */
    name?: string;
    fileHandle?: FileSystemHandle | null;
    exportingFrame: ExcalidrawFrameLikeElement | null;
  },
  fileName?: string | null,
  fun?: any,
) => {
  if (fileName) {
    name = fileName;
  }
  if (elements.length === 0) {
    throw new Error(t("alerts.cannotExportEmptyCanvas"));
  }
  if (type === "svg" || type === "clipboard-svg") {
    const svgPromise = exportToSvg(
      elements,
      {
        exportBackground,
        exportWithDarkMode: appState.exportWithDarkMode,
        viewBackgroundColor,
        exportPadding,
        exportScale: appState.exportScale,
        exportEmbedScene: appState.exportEmbedScene && type === "svg",
      },
      files,
      { exportingFrame },
    );

    if (type === "svg") {
      return fileSave(
        svgPromise.then((svg) => {
          return new Blob([svg.outerHTML], { type: MIME_TYPES.svg });
        }),
        {
          description: "Export to SVG",
          name,
          extension: appState.exportEmbedScene ? "excalidraw.svg" : "svg",
          fileHandle,
        },
      );
    } else if (type === "clipboard-svg") {
      const svg = await svgPromise.then((svg) => svg.outerHTML);
      try {
        await copyTextToSystemClipboard(svg);
      } catch (e) {
        throw new Error(t("errors.copyToSystemClipboardFailed"));
      }
      return;
    }
  }

  const tempCanvas = exportToCanvas(elements, appState, files, {
    exportBackground,
    viewBackgroundColor,
    exportPadding,
    exportingFrame,
  });
  if (type === "grzyk" || type === "kt") {
    const blob = canvasToBlob(tempCanvas);
    let b: any = null;
    blob.then(async (blob) => {
      b = blob;
      console.log("🚀  blob.then  blob:", b);
      console.log("🚀  name:", name);
      const excalidrawData =
        JSON.parse(localStorage.getItem("excalidrawData") || "{}") || {};
      if (type === "kt") {
        const formData = new FormData();
        formData.append("fid", "0");
        formData.append("courseid", excalidrawData.courseid || "1395");
        formData.append("token", excalidrawData.token || "");
        formData.append("tid", excalidrawData.tid || "");
        formData.append("ttid", excalidrawData.ttid || "");
        formData.append("resType", "0");
        formData.append("id", "WU_FILE_0");
        formData.append("name", `${name}.png`);
        formData.append("type", b?.type);
        formData.append("lastModifiedDate", new Date().toString());
        formData.append("size", b?.size);
        formData.append("multiFile", b);
        await fetch(
          `${window.KT_REQURE_URL}/appresource/uploadPersonalDocument`,
          {
            method: "POST",
            headers: {
              Authtoken: excalidrawData.token,
            },
            body: formData,
          },
        ).then((response) => {
          if (response.ok) {
            response.json().then(async (res) => {
              if (res.errcode === 200) {
                const { data } = res;
                const docs = JSON.stringify([data.id.toString()]);

                const params = {
                  docs,
                  scid: excalidrawData.scid,
                  ttid: excalidrawData.ttid,
                  upsize: data.size,
                  courseid: data.courseid,
                  timeStamap: Date.now(),
                };
                const docData: any = await getRequest(
                  "/teacher/courseDocument/uploadtoClassDoc",
                  params,
                  window.KT_REQURE_URL,
                );
                if (docData.data.errcode === 200) {
                  fun("保存成功");
                }
              }
            });
          }
        });
      } else {
        const formData = new FormData();
        formData.append("chunkNumber", "1");
        formData.append("currentChunkSize", b?.size);
        formData.append("totalSize", b?.size);
        formData.append("identifier", `${b?.size}-${name}png`);
        formData.append("filename", `${name}.png`);
        formData.append("relativePath", `${name}.png`);
        formData.append("totalChunks", "1");
        formData.append("name", `${name}.png`);
        formData.append("size", b?.size);
        formData.append("type", b?.type);
        formData.append("id", "WU_FILE_2");
        formData.append("lastModifiedDate", new Date().toString());
        formData.append("fid", "");
        // formData.append("courseid", excalidrawData.courseid || "");
        formData.append("resType", "1");
        formData.append("tid", excalidrawData.tid || "");
        formData.append("token", excalidrawData.token || "");
        formData.append("chunk", "0");
        formData.append("chunks", "1");
        formData.append("multiFile", b);
        const courseData: any = await postRequest(
          "/myresources/getMyResCourseByTid",
          { tId: excalidrawData.tid },
          window.JX_REQURE_URL,
        );
        if (courseData.data.errcode === 200) {
          formData.append("courseid", courseData.data.data.id || "");
          await fetch(
            `${window.JX_REQURE_URL}/teacher/resdocument/uploadResourceOfPC`,
            {
              method: "POST",
              headers: {
                Authtoken: excalidrawData.token,
              },
              body: formData,
            },
          ).then((response) => {
            if (response.ok) {
              response.json().then(async (res) => {
                if (res.errcode === 200) {
                  fun("保存成功");
                } else {
                  fun(res.errmsg);
                }
              });
            }
          });
        }
      }
    });
    return b;
  }
  if (type === "png") {
  } else if (type === "clipboard") {
    try {
      const blob = canvasToBlob(tempCanvas);
      await copyBlobToClipboardAsPng(blob);
    } catch (error: any) {
      console.warn(error);
      if (error.name === "CANVAS_POSSIBLY_TOO_BIG") {
        throw new Error(t("canvasError.canvasTooBig"));
      }
      // TypeError *probably* suggests ClipboardItem not defined, which
      // people on Firefox can enable through a flag, so let's tell them.
      if (isFirefox && error.name === "TypeError") {
        throw new Error(
          `${t("alerts.couldNotCopyToClipboard")}\n\n${t(
            "hints.firefox_clipboard_write",
          )}`,
        );
      } else {
        throw new Error(t("alerts.couldNotCopyToClipboard"));
      }
    }
  } else {
    // shouldn't happen
    throw new Error("Unsupported export type");
  }
};
