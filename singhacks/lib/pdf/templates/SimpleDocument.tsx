import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export type SimpleDocProps = {
  title?: string;
  subtitle?: string;
  items?: string[];
};

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 12, fontFamily: 'Helvetica' } as any,
  header: { marginBottom: 12 } as any,
  title: { fontSize: 18, marginBottom: 4 } as any,
  subtitle: { fontSize: 12, color: '#666' } as any,
  listItem: { marginBottom: 6 } as any,
});

export default function SimpleDocument({ title = 'Document', subtitle, items = [] }: SimpleDocProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {items.map((it, i) => (
          <Text key={i} style={styles.listItem}>
            {i + 1}. {it}
          </Text>
        ))}
      </Page>
    </Document>
  );
}
