// src/App.jsx
import { useEffect, useState } from "react";
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";
import { generateClient } from "aws-amplify/data";
import { Authenticator, View, Heading, Button, Text, TextField, Flex, Image } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { uploadData, getUrl, remove } from "aws-amplify/storage";

// Initialize Amplify using the generated client config (Gen 2)
Amplify.configure(outputs);

// Create a Data client (assumes a model named `Note`)
const client = generateClient();

export default function App() {
  const [notes, setNotes] = useState([]);
  const [formState, setFormState] = useState({ name: "", description: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  // ------- Data helpers -------

  async function fetchNotes() {
    setBusy(true);
    try {
      const { data, errors } = await client.models.Note.list();
      if (errors?.length) {
        console.error("List errors:", errors);
      }

      // If a note has an image path, resolve a signed URL to display it
      const withUrls = await Promise.all(
        (data ?? []).map(async (n) => {
          if (n.image) {
            try {
              const { url } = await getUrl({ path: n.image });
              return { ...n, imageUrl: url.toString() };
            } catch {
              return { ...n, imageUrl: null };
            }
          }
          return n;
        })
      );

      // Sort newest first (optional)
      withUrls.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      setNotes(withUrls);
    } finally {
      setBusy(false);
    }
  }

  async function createNote(e) {
    e.preventDefault();
    if (!formState.name?.trim()) return;

    setBusy(true);
    try {
      let imagePath = null;

      // 1) If user selected an image, upload it to Amplify Storage first
      if (file) {
        const path = `notes/${crypto.randomUUID()}-${file.name}`;
        await uploadData({ path, data: file }).result;
        imagePath = path;
      }

      // 2) Create the Note in the Data API and associate the image path (if any)
      const { data: created, errors } = await client.models.Note.create({
        name: formState.name.trim(),
        description: formState.description?.trim() || "",
        image: imagePath, // store Storage path string on the model
      });

      if (errors?.length) {
        console.error("Create errors:", errors);
      }

      // 3) Refresh list
      setFormState({ name: "", description: "" });
      setFile(null);
      await fetchNotes();

      return created;
    } finally {
      setBusy(false);
    }
  }

  async function deleteNote(note) {
    if (!note?.id) return;
    setBusy(true);
    try {
      // If the note has an associated image, remove it from Storage
      if (note.image) {
        try {
          await remove({ path: note.image });
        } catch (err) {
          console.warn("Failed to remove image from storage:", err);
        }
      }
      // Delete the note itself
      const { errors } = await client.models.Note.delete({ id: note.id });
      if (errors?.length) {
        console.error("Delete errors:", errors);
      }
      await fetchNotes();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetchNotes();
  }, []);

  return (
    <Authenticator>
      {({ signOut, user }) => (
        <View padding="1rem" maxWidth="860px" margin="0 auto">
          <Flex justifyContent="space-between" alignItems="center" marginBottom="1rem">
            <Heading level={3}>Notes</Heading>
            <Flex alignItems="center" gap="0.75rem">
              <Text fontSize="0.9rem">Signed in as {user?.username}</Text>
              <Button onClick={signOut} variation="link">Sign out</Button>
            </Flex>
          </Flex>

          {/* Create Note Form */}
          <form onSubmit={createNote}>
            <Flex direction="column" gap="0.75rem">
              <TextField
                label="Title"
                placeholder="Note title"
                value={formState.name}
                onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                isRequired
              />
              <TextField
                label="Description"
                placeholder="Optional description"
                value={formState.description}
                onChange={(e) => setFormState((s) => ({ ...s, description: e.target.value }))}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button type="submit" isDisabled={busy}>
                {busy ? "Working..." : "Create Note"}
              </Button>
            </Flex>
          </form>

          {/* Notes List */}
          <View marginTop="2rem">
            {busy && notes.length === 0 ? <Text>Loading…</Text> : null}
            <Flex wrap="wrap" gap="1rem">
              {notes.map((n) => (
                <Flex
                  key={n.id}
                  direction="column"
                  padding="1rem"
                  border="1px solid var(--amplify-colors-border-primary)"
                  borderRadius="12px"
                  width="260px"
                  gap="0.5rem"
                >
                  <Heading level={5} margin="0">
                    {n.name}
                  </Heading>
                  {n.description ? <Text fontSize="0.9rem">{n.description}</Text> : null}
                  {n.imageUrl ? (
                    <Image
                      alt={n.name}
                      src={n.imageUrl}
                      width="100%"
                      height="160px"
                      objectFit="cover"
                      borderRadius="8px"
                    />
                  ) : null}
                  <Button
                    size="small"
                    variation="destructive"
                    onClick={() => deleteNote(n)}
                    isDisabled={busy}
                  >
                    Delete
                  </Button>
                </Flex>
              ))}
            </Flex>
          </View>
        </View>
      )}
    </Authenticator>
  );
}

