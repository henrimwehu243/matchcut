import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#09090b",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          border: "16px solid #27272a",
        }}
      >
        <div
          style={{
            fontSize: 220,
            fontFamily: "Georgia, serif",
            color: "#f4f1ea",
            letterSpacing: "-0.06em",
            lineHeight: 1,
          }}
        >
          MC
        </div>
        <div
          style={{
            marginTop: 20,
            width: 80,
            height: 6,
            background: "#34d399",
          }}
        />
      </div>
    ),
    { ...size },
  );
}