import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export type SimpleDocProps = {
  title?: string;
  subtitle?: string;
  items?: string[];
};

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 12, fontFamily: "Helvetica" },
  header: { marginBottom: 12 },
  title: { fontSize: 18, marginBottom: 4 },
  subtitle: { fontSize: 12, color: "#666666" },
  listItem: { marginBottom: 6 },
});

export default function SimpleDocument({ title = "Document", subtitle, items = [] }: SimpleDocProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {items.map((item, index) => (
          <Text key={index} style={styles.listItem}>
            {index + 1}. {item}
          </Text>
        ))}
      </Page>
    </Document>
  );
}
