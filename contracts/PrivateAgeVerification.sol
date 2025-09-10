// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint8, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivateAgeVerification is SepoliaConfig {

    address public owner;
    uint256 public totalVerifications;

    struct AgeVerification {
        euint8 encryptedAge;
        bool isVerified;
        uint256 timestamp;
        ebool isAdult;
        bool verificationCompleted;
    }

    struct VerificationResult {
        address user;
        bool isAdult;
        uint256 timestamp;
        bool success;
    }

    mapping(address => AgeVerification) public userVerifications;
    mapping(address => bool) public authorizedVerifiers;
    mapping(address => bool) public pendingVerifications;
    VerificationResult[] public verificationHistory;

    uint8 constant ADULT_AGE_THRESHOLD = 18;
    uint8 constant SENIOR_AGE_THRESHOLD = 65;

    event AgeSubmitted(address indexed user, uint256 timestamp);
    event VerificationCompleted(address indexed user, bool isAdult, uint256 timestamp);
    event VerifierAdded(address indexed verifier);
    event VerifierRemoved(address indexed verifier);
    event AgeVerificationRequested(address indexed user, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    modifier onlyAuthorizedVerifier() {
        require(authorizedVerifiers[msg.sender] || msg.sender == owner, "Not authorized verifier");
        _;
    }

    modifier onlyValidAge(uint8 _age) {
        require(_age >= 1 && _age <= 120, "Invalid age range");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedVerifiers[msg.sender] = true;
        totalVerifications = 0;
    }

    // 用户提交加密年龄
    function submitEncryptedAge(uint8 _age) external onlyValidAge(_age) {
        require(!userVerifications[msg.sender].isVerified, "Already verified");

        // 加密年龄数据
        euint8 encryptedAge = FHE.asEuint8(_age);

        // 使用FHE进行隐私年龄比较
        ebool isAdult = FHE.ge(encryptedAge, FHE.asEuint8(ADULT_AGE_THRESHOLD));

        userVerifications[msg.sender] = AgeVerification({
            encryptedAge: encryptedAge,
            isVerified: true,
            timestamp: block.timestamp,
            isAdult: isAdult,
            verificationCompleted: false
        });

        // 设置访问控制权限
        FHE.allowThis(encryptedAge);
        FHE.allowThis(isAdult);
        FHE.allow(encryptedAge, msg.sender);
        FHE.allow(isAdult, msg.sender);

        totalVerifications++;

        emit AgeSubmitted(msg.sender, block.timestamp);
    }

    // 请求年龄验证结果 - 简化版本，返回加密的验证结果
    function getVerificationResult() external view returns (ebool) {
        require(userVerifications[msg.sender].isVerified, "Age not submitted");

        AgeVerification storage verification = userVerifications[msg.sender];
        return verification.isAdult;
    }

    // 管理员可以为用户完成验证（用于演示目的）
    function completeVerificationForUser(address user, bool isAdult) external onlyAuthorizedVerifier {
        require(userVerifications[user].isVerified, "User age not submitted");
        require(!userVerifications[user].verificationCompleted, "Verification already completed");

        userVerifications[user].verificationCompleted = true;

        // 记录验证历史
        verificationHistory.push(VerificationResult({
            user: user,
            isAdult: isAdult,
            timestamp: block.timestamp,
            success: true
        }));

        emit VerificationCompleted(user, isAdult, block.timestamp);
    }

    // 检查用户是否为成年人（仅返回公开结果）
    function isUserAdult(address user) external view returns (bool completed, bool isAdult) {
        AgeVerification storage verification = userVerifications[user];
        if (!verification.verificationCompleted) {
            return (false, false);
        }

        // 查找历史记录中的结果
        for (uint i = verificationHistory.length; i > 0; i--) {
            if (verificationHistory[i-1].user == user) {
                return (true, verificationHistory[i-1].isAdult);
            }
        }

        return (false, false);
    }

    // 验证年龄范围（高级功能）
    function verifyAgeRange(uint8 minAge, uint8 maxAge) external returns (ebool) {
        require(userVerifications[msg.sender].isVerified, "Age not submitted");
        require(minAge <= maxAge, "Invalid age range");

        AgeVerification storage verification = userVerifications[msg.sender];

        // 检查年龄是否在指定范围内
        euint8 minAgeEncrypted = FHE.asEuint8(minAge);
        euint8 maxAgeEncrypted = FHE.asEuint8(maxAge);

        ebool ageAboveMin = FHE.ge(verification.encryptedAge, minAgeEncrypted);
        ebool ageBelowMax = FHE.le(verification.encryptedAge, maxAgeEncrypted);

        return FHE.and(ageAboveMin, ageBelowMax);
    }

    // 比较两个用户年龄（不泄露具体年龄）
    function compareAges(address otherUser) external returns (ebool) {
        require(userVerifications[msg.sender].isVerified, "Your age not submitted");
        require(userVerifications[otherUser].isVerified, "Other user age not submitted");

        AgeVerification storage myVerification = userVerifications[msg.sender];
        AgeVerification storage otherVerification = userVerifications[otherUser];

        // 返回当前用户是否比另一用户年龄大
        return FHE.gt(myVerification.encryptedAge, otherVerification.encryptedAge);
    }

    // 添加授权验证者
    function addAuthorizedVerifier(address verifier) external onlyOwner {
        require(verifier != address(0), "Invalid verifier address");
        authorizedVerifiers[verifier] = true;
        emit VerifierAdded(verifier);
    }

    // 移除授权验证者
    function removeAuthorizedVerifier(address verifier) external onlyOwner {
        require(verifier != owner, "Cannot remove owner");
        authorizedVerifiers[verifier] = false;
        emit VerifierRemoved(verifier);
    }

    // 获取用户验证状态
    function getUserVerificationStatus(address user) external view returns (
        bool hasSubmittedAge,
        bool verificationCompleted,
        uint256 timestamp
    ) {
        AgeVerification storage verification = userVerifications[user];
        return (
            verification.isVerified,
            verification.verificationCompleted,
            verification.timestamp
        );
    }

    // 获取验证统计信息
    function getVerificationStats() external view returns (
        uint256 totalUsers,
        uint256 completedVerifications,
        uint256 pendingCount
    ) {
        uint256 completed = verificationHistory.length;
        return (
            totalVerifications,
            completed,
            totalVerifications - completed
        );
    }

    // 获取验证历史记录
    function getVerificationHistory(uint256 startIndex, uint256 count)
        external
        view
        onlyAuthorizedVerifier
        returns (VerificationResult[] memory)
    {
        require(startIndex < verificationHistory.length, "Invalid start index");

        uint256 endIndex = startIndex + count;
        if (endIndex > verificationHistory.length) {
            endIndex = verificationHistory.length;
        }

        VerificationResult[] memory results = new VerificationResult[](endIndex - startIndex);
        for (uint256 i = startIndex; i < endIndex; i++) {
            results[i - startIndex] = verificationHistory[i];
        }

        return results;
    }

    // 重置用户验证状态（仅限所有者）
    function resetUserVerification(address user) external onlyOwner {
        delete userVerifications[user];
    }

    // 检查是否为授权验证者
    function isAuthorizedVerifier(address verifier) external view returns (bool) {
        return authorizedVerifiers[verifier];
    }

    // 紧急暂停功能
    bool public emergencyPaused = false;

    modifier whenNotPaused() {
        require(!emergencyPaused, "Contract is paused");
        _;
    }

    function emergencyPause() external onlyOwner {
        emergencyPaused = true;
    }

    function emergencyUnpause() external onlyOwner {
        emergencyPaused = false;
    }
}