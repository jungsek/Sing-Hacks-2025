import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

/**
 * Standardized risk levels for AI analysis.
 * These values map directly to specific color codes in getRiskColor().
 *
 * Critical: #991b1b - Severe compliance violations or high-risk activities
 * High: #dc2626 - Significant compliance concerns requiring immediate attention
 * Moderate: #ca8a04 - Notable issues that should be addressed
 * Low: #16a34a - Minor or no compliance concerns
 */
type RiskLevel = "Critical" | "High" | "Moderate" | "Low";

/**
 * Core structure for AI-generated analysis results.
 * This can be extended with additional fields as the AI capabilities grow.
 *
 * @property riskLevel - Overall risk assessment from the AI
 * @property summary - Detailed explanation of findings and concerns
 * @property confidenceScore - AI's confidence in its assessment (0-1)
 * @property keyFindings - Bullet points of critical discoveries
 * @property recommendations - Suggested actions for risk mitigation
 */
type AIAnalysis = {
  riskLevel: RiskLevel;
  summary: string;
  confidenceScore?: number;
  keyFindings?: string[];
  recommendations?: string[];
};

/**
 * Document metadata structure.
 * This represents the basic information about each uploaded document.
 *
 * @property id - Unique identifier used to map AI assessments to documents
 * @property filename - Original name of the uploaded file
 * @property uploadedAt - Timestamp of document upload
 */
type DocumentInfo = {
  id: string;
  filename: string;
  uploadedAt: string;
};

/**
 * Main props interface for the ComplianceReport component.
 * This structure defines all the data needed to generate a complete compliance report.
 *
 * Integration Points for AI:
 * 1. Overall Analysis:
 *    - overallRisk: Aggregate risk level for all documents
 *    - overallSummary: Combined analysis of all findings
 *
 * 2. Per-Document Analysis:
 *    - assessments: Array of individual document analyses
 *    - Each assessment maps to a document via its ID
 *
 * AI Integration Flow:
 * 1. AI receives documents array with document content
 * 2. For each document:
 *    - Analyze content
 *    - Generate risk level and summary
 *    - Add to assessments array
 * 3. Analyze collective risk and generate overall summary
 * 4. Populate overallRisk and overallSummary
 */
export type ComplianceReportProps = {
  // Document metadata
  filename?: string;
  generatedOn?: string; // Format: '01 Nov 2025, 14:43 SGT'
  generatedBy?: string; // e.g., 'Agentic AML System'
  logoDataUri?: string; // Company/system logo
  originalTitle?: string; // Custom title for the report
  docId?: string; // Unique identifier for the report

  // Client information
  clientName?: string; // Name of the client being analyzed
  clientId?: string; // Client's unique identifier

  // Document array for batch processing
  documents?: Array<DocumentInfo>; // All documents to be analyzed

  // AI-generated analysis
  overallRisk?: RiskLevel; // Aggregate risk level
  overallSummary?: string; // Overall analysis and findings
  assessments?: Array<{
    id: string; // Maps to document.id
    riskLevel: RiskLevel; // AI-determined risk level
    summary: string; // AI-generated analysis
  }>;
};

const COLORS = {
  body: "#1A1A1A",
  lightGray: "#F2F2F2",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 72,
    paddingBottom: 56,
    paddingHorizontal: 72,
    fontFamily: "Helvetica",
    color: COLORS.body,
    fontSize: 11,
  } as any,
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  } as any,
  logoBox: {
    width: 50,
    height: 50,
    backgroundColor: COLORS.lightGray,
    justifyContent: "center",
    alignItems: "center",
  } as any,
  title: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 6,
  } as any,
});

/**
 * Maps standardized risk levels to specific color codes for visual representation.
 * These colors are designed for optimal readability and risk indication:
 *
 * - Critical: Deep Red (#991b1b) - Immediate attention required
 * - High: Bright Red (#dc2626) - Significant concerns
 * - Moderate: Amber (#ca8a04) - Notable issues
 * - Low: Green (#16a34a) - Minor or no concerns
 *
 * @param level - The risk level determined by the AI
 * @returns The corresponding color code
 */
function getRiskColor(level?: RiskLevel) {
  switch (level) {
    case "Critical":
      return "#991b1b"; // Deep red - severe issues
    case "High":
      return "#dc2626"; // Bright red - significant concerns
    case "Moderate":
      return "#ca8a04"; // Amber - moderate issues
    case "Low":
    default:
      return "#16a34a"; // Green - low/no risk
  }
}

/**
 * Generates a PDF compliance report based on AI analysis of uploaded documents.
 *
 * Key Features:
 * 1. Adaptive Layout:
 *    - Single document: Shows only overall analysis
 *    - Multiple documents: Shows overall analysis + individual assessments
 *
 * 2. Risk Visualization:
 *    - Color-coded risk levels
 *    - Detailed summaries for each risk assessment
 *
 * 3. Document Organization:
 *    - Main page with aggregate analysis
 *    - Subsequent pages for individual documents (multi-doc only)
 *
 * AI Integration Points:
 * - Overall risk level and summary displayed on first page
 * - Individual document assessments on subsequent pages
 * - Risk levels mapped to standardized colors
 *
 * @param props ComplianceReportProps containing document data and AI analysis
 */
export default function ComplianceReport(props: ComplianceReportProps) {
  const {
    filename,
    generatedOn,
    generatedBy,
    logoDataUri,
    originalTitle,
    docId,
    clientName,
    clientId,
    documents = [], // Array of documents to analyze
    overallRisk, // AI-determined overall risk level
    overallSummary, // AI-generated overall analysis
    assessments = [], // AI assessments for each document
  } = props;

  const singleDocument = documents && documents.length === 1 ? documents[0] : null;

  const findAssessment = (id: string) =>
    assessments.find((a) => a.id === id) || { riskLevel: undefined, summary: "" };

  return (
    <Document>
      {/* Main cover / summary page */}
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerRow} fixed>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {typeof logoDataUri === "string" && logoDataUri ? (
              <Image src={logoDataUri} style={{ width: 50, height: 50, marginRight: 8 }} />
            ) : (
              <View style={styles.logoBox}>
                <Text style={{ fontSize: 10, color: COLORS.body }}>COMPANY</Text>
              </View>
            )}
          </View>

          <View>
            <Text style={{ fontSize: 9, textAlign: "right", color: "#555555" }}>
              {generatedBy || "Agentic AML System"}
            </Text>
            <Text style={{ fontSize: 9, textAlign: "right", color: "#555555" }}>
              {generatedOn ? `Generated on: ${generatedOn}` : ""}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>{originalTitle ? originalTitle : filename}</Text>

        {/* Document information section */}
        <View style={{ marginTop: 4, marginBottom: 12 }}>
          {originalTitle && docId && (
            <Text style={{ fontSize: 9, color: "#555555", textAlign: "left", marginBottom: 2 }}>
              Document ID: {docId}
            </Text>
          )}

          {clientName && (
            <Text style={{ fontSize: 9, color: "#555555", textAlign: "left", marginBottom: 2 }}>
              Client Name: {clientName}
            </Text>
          )}
          {clientId && (
            <Text style={{ fontSize: 9, color: "#555555", textAlign: "left", marginBottom: 2 }}>
              Client ID: {clientId}
            </Text>
          )}
        </View>

        {/* Overall Risk Assessment Section */}
        <View style={{ marginTop: 24, marginBottom: 24 }}>
          <Text style={{ fontSize: 14, fontWeight: "bold", marginBottom: 12, color: COLORS.body }}>
            Overall Risk Assessment
          </Text>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: "bold", marginBottom: 4 }}>Risk Level</Text>
            <Text style={{ fontSize: 13, color: getRiskColor(overallRisk) }}>
              {overallRisk || "Pending AI Analysis"}
            </Text>
          </View>

          <View>
            <Text style={{ fontSize: 12, fontWeight: "bold", marginBottom: 4 }}>
              Analysis Summary
            </Text>
            <Text style={{ fontSize: 11, lineHeight: 1.5 }}>
              {overallSummary || "A comprehensive risk analysis will be provided by the AI agent."}
            </Text>
          </View>
        </View>
      </Page>

      {/* Only render per-document pages when there are multiple documents */}
      {documents &&
        documents.length > 1 &&
        documents.map((d) => {
          const ass = findAssessment(d.id);
          return (
            <Page key={d.id} size="A4" style={styles.page} wrap>
              <View style={styles.headerRow} fixed>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {typeof logoDataUri === "string" && logoDataUri ? (
                    <Image src={logoDataUri} style={{ width: 50, height: 50, marginRight: 8 }} />
                  ) : (
                    <View style={styles.logoBox}>
                      <Text style={{ fontSize: 10, color: COLORS.body }}>COMPANY</Text>
                    </View>
                  )}
                </View>

                <View>
                  <Text style={{ fontSize: 9, textAlign: "right", color: "#555555" }}>
                    {generatedBy || "Agentic AML System"}
                  </Text>
                  <Text style={{ fontSize: 9, textAlign: "right", color: "#555555" }}>
                    {generatedOn ? `Generated on: ${generatedOn}` : ""}
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 16, fontWeight: "bold", marginTop: 6 }}>{d.filename}</Text>
              <Text style={{ fontSize: 10, color: "#555", marginBottom: 12 }}>
                Uploaded at: {d.uploadedAt}
              </Text>

              <View>
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: "bold", marginBottom: 4 }}>
                    Risk Level
                  </Text>
                  <Text style={{ fontSize: 13, color: getRiskColor(ass.riskLevel) }}>
                    {ass.riskLevel || "Pending AI Analysis"}
                  </Text>
                </View>

                <View>
                  <Text style={{ fontSize: 12, fontWeight: "bold", marginBottom: 4 }}>
                    Analysis Summary
                  </Text>
                  <Text style={{ fontSize: 11, lineHeight: 1.5 }}>
                    {ass.summary ||
                      "A detailed analysis of this document will be provided by the AI agent."}
                  </Text>
                </View>
              </View>
            </Page>
          );
        })}
    </Document>
  );
}
