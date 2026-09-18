import type { ExtraResources } from "fe_core";

import arSA from "./ar-SA.json";
import en from "./en.json";
import es from "./es.json";
import ja from "./ja.json";
import km from "./km.json";
import ko from "./ko.json";
import mn from "./mn.json";
import ms from "./ms.json";
import my from "./my.json";
import ru from "./ru.json";
import th from "./th.json";
import vi from "./vi.json";
import zhHans from "./zh-Hans.json";

/** App locale bundles passed to AppCore extraResources (BCP 47 codes). */
export const extraResources = {
  en: { translation: en },
  "zh-Hans": { translation: zhHans },
  ms: { translation: ms },
  ja: { translation: ja },
  ko: { translation: ko },
  ru: { translation: ru },
  vi: { translation: vi },
  mn: { translation: mn },
  es: { translation: es },
  "ar-SA": { translation: arSA },
  th: { translation: th },
  my: { translation: my },
  km: { translation: km },
} satisfies ExtraResources;
