import { NextRequest, NextResponse } from "next/server";
import { uploadTaskAttachment } from "@/lib/clickup";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

/** Anexa o roteiro em PDF a uma task de captação já criada. */
export async function POST(req: NextRequest, { params }: { params: { taskId: string } }) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulário inválido" }, { status: 400 });
  }

  const file = formData.get("arquivo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Só é aceito arquivo PDF" }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Arquivo maior que 15MB" }, { status: 400 });
  }

  try {
    await uploadTaskAttachment(params.taskId, file, file.name || "roteiro.pdf");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
